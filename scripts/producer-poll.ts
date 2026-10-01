import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { JSONWebKeySet, JWK } from "@hos-ai/sdk";
import { Pool } from "pg";

import { createApaleoClient } from "../lib/hos/mappings/apaleo-client";
import { apaleoCapabilities } from "../lib/hos/mappings/apaleo-sync";
import { createMewsClient } from "../lib/hos/mappings/mews-client";
import { mewsCapabilities } from "../lib/hos/mappings/mews-sync";
import type { MappingCapabilities } from "../lib/hos/mappings/sync";
import { apaleoPoll, apaleoScopesBeyondReading } from "../lib/hos/producer/apaleo-poll";
import { type ProducerConfig, purgeJournal } from "../lib/hos/producer/delivery";
import { producerManifest } from "../lib/hos/producer/manifest";
import { mewsPoll } from "../lib/hos/producer/mews-poll";
import { type Poll, pollEvery, pollingDefaults, pollOnce, type PollOutcome, type PollTarget } from "../lib/hos/producer/poll";
import { publishManifest } from "../lib/hos/producer/publish";

// Runs the pilot's persistent producer for one PMS property (FO-02 and FO-03 of FINISH-OBSERVE). It polls the PMS every
// --interval-minutes, writes what the adapter makes of each poll to the producer's database, and once a day purges the
// journal beyond --retention-days and signs its manifest again. It reads the database from DATABASE_URL and never writes
// to the PMS.
//
//   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run producer:poll -- --pms mews --mews-enterprise <id> --tenant <tenant> --property <property id>
//   APALEO_CLIENT_ID=… APALEO_CLIENT_SECRET=… npm run producer:poll -- --pms apaleo --apaleo-property MUC --tenant <tenant> --property <property id>
//
// --property is the HOS property id the facts carry. --source defaults to urn:hos:pms:<pms>. --days, 2 by default, is how
// far ahead of today each poll reads reservations. --once runs a single poll. Ctrl+C stops after the poll under way; the
// next start resumes from what the database holds.
//
// The manifest: --publish <dir> writes manifest.json, manifest.jws and jwks.json there, signed with --signing-key, a
// private key that hos manifest keygen creates, for --signature-days (7 by default). --jwks is the key set it publishes,
// which holds the signing key's public half. --manifest <file> writes the manifest alone, unsigned.
//
// Mews: --mews-enterprise is the enterprise the tokens must open; another one is refused. MEWS_PLATFORM_ADDRESS defaults
// to https://api.mews-demo.com, whose demo tokens Mews publishes in its Connector API documentation. MEWS_SERVICE_IDS,
// comma-separated, overrides the accommodation services.
//
// Apaleo: the credentials of a simple client (custom app) of the account, with the scopes setup.read, reservations.read
// and maintenances.read. --apaleo-property is the Apaleo property id, and --inspections says the property inspects its
// rooms, so that Clean means inspected. APALEO_IDENTITY_ADDRESS and APALEO_API_ADDRESS default to Apaleo's production
// hosts.

const { values: args } = parseArgs({
  options: {
    pms: { type: "string" },
    tenant: { type: "string" },
    property: { type: "string" },
    source: { type: "string" },
    "mews-enterprise": { type: "string" },
    "apaleo-property": { type: "string" },
    inspections: { type: "boolean", default: false },
    days: { type: "string", default: "2" },
    "interval-minutes": { type: "string", default: String(pollingDefaults.intervalMs / 60_000) },
    "retention-days": { type: "string", default: "30" },
    manifest: { type: "string" },
    publish: { type: "string" },
    "signing-key": { type: "string" },
    jwks: { type: "string" },
    "signature-days": { type: "string", default: "7" },
    once: { type: "boolean", default: false },
  },
});

type Pms<State> = { capabilities: MappingCapabilities; poll: Poll<State>; check?: () => Promise<void> };

function mews(target: PollTarget, days: number): Pms<unknown> {
  const clientToken = process.env.MEWS_CLIENT_TOKEN;
  const accessToken = process.env.MEWS_ACCESS_TOKEN;
  if (!clientToken || !accessToken) throw new Error("Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN.");
  const enterpriseId = args["mews-enterprise"];
  if (!enterpriseId) throw new Error("--mews-enterprise names the enterprise the Mews tokens must open.");
  const client = createMewsClient({
    platform: process.env.MEWS_PLATFORM_ADDRESS ?? "https://api.mews-demo.com",
    clientToken,
    accessToken,
    client: "HOS AI pilot producer 0.1",
    maxPages: 50,
    onTruncated: "fail",
  });
  const serviceIds = process.env.MEWS_SERVICE_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return { capabilities: mewsCapabilities, poll: mewsPoll(client, { ...target, enterpriseId, days, serviceIds }) as Poll<unknown> };
}

function apaleo(target: PollTarget, days: number): Pms<unknown> {
  const clientId = process.env.APALEO_CLIENT_ID;
  const clientSecret = process.env.APALEO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Set APALEO_CLIENT_ID and APALEO_CLIENT_SECRET.");
  const apaleoPropertyId = args["apaleo-property"];
  if (!apaleoPropertyId) throw new Error("--apaleo-property names the Apaleo property to poll.");
  const client = createApaleoClient({
    identity: process.env.APALEO_IDENTITY_ADDRESS ?? "https://identity.apaleo.com",
    api: process.env.APALEO_API_ADDRESS ?? "https://api.apaleo.com",
    clientId,
    clientSecret,
    maxPages: 50,
    onTruncated: "fail",
  });
  return {
    capabilities: apaleoCapabilities,
    poll: apaleoPoll(client, { ...target, apaleoPropertyId, inspections: args.inspections, days }) as Poll<unknown>,
    // The producer only reads; an app that may write is more than the pilot needs.
    async check() {
      const beyond = apaleoScopesBeyondReading(await client.scopes());
      if (beyond.length)
        console.warn(
          `Warning: the Apaleo app has ${beyond.length} scope(s) beyond reading, such as ${beyond.slice(0, 3).join(", ")}. Give the pilot an app with read scopes only.`,
        );
    },
  };
}

const whole = (name: string, value: string | undefined, min: number) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) throw new Error(`--${name} must be a whole number, at least ${min}: ${value}.`);
  return number;
};

const log = (outcome: PollOutcome, at: Date) =>
  console.log(
    outcome.ok
      ? `${at.toISOString()} poll: ${outcome.result.appended.length} new fact(s), ${outcome.result.repeated.length} already written` +
          (outcome.result.changed.length ? `, ${outcome.result.changed.length} refused under an existing id` : "")
      : `${at.toISOString()} poll failed: ${outcome.error}`,
  );

// What --publish needs: the private key it signs with, and the key set it publishes.
function signing() {
  if (!args.publish) return undefined;
  if (!args["signing-key"] || !args.jwks) throw new Error("--publish needs --signing-key, the private key, and --jwks, the key set to publish.");
  const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown;
  return {
    dir: args.publish,
    privateJwk: read(args["signing-key"]) as JWK,
    jwks: read(args.jwks) as JSONWebKeySet,
    days: whole("signature-days", args["signature-days"], 1),
  };
}

async function produce(
  target: PollTarget,
  { capabilities, poll, check }: Pms<unknown>,
  { intervalMs, retention }: { intervalMs: number; retention: ProducerConfig },
) {
  const manifest = producerManifest(target, capabilities, retention);
  if (args.manifest) {
    writeFileSync(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Manifest written to ${args.manifest}.`);
  }
  const signer = signing();
  const publish = async (at: Date) => {
    if (!signer) return;
    const published = await publishManifest(signer.dir, manifest, { ...signer, now: at });
    console.log(`${at.toISOString()} manifest signed with key ${published.kid} until ${published.expiresAt}, published in ${signer.dir}.`);
  };
  await check?.();
  await publish(new Date());

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (args.once) {
      const at = new Date();
      const outcome = await pollOnce(pool, target, poll, at);
      log(outcome, at);
      if (!outcome.ok) process.exitCode = 1;
      return;
    }
    const stop = new AbortController();
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());
    let dailyAt = Date.now();
    console.log(`Polling ${target.source} for ${target.tenant}, ${target.propertyId}, every ${intervalMs / 60_000} minute(s). Ctrl+C stops.`);
    await pollEvery(pool, target, poll, {
      intervalMs,
      signal: stop.signal,
      onPoll: async (outcome, at) => {
        log(outcome, at);
        // Once a day, the journal beyond retention is purged and the manifest signed again, well before it expires.
        if (at.getTime() - dailyAt < 86_400_000) return;
        dailyAt = at.getTime();
        for (const [task, run] of [
          [
            "purge",
            async () => {
              const { purged } = await purgeJournal(pool, target, retention, at);
              if (purged) console.log(`${at.toISOString()} purge: ${purged} fact(s) beyond ${retention.retentionDays} days.`);
            },
          ],
          ["signature", () => publish(at)],
        ] as const)
          try {
            await run();
          } catch (error) {
            console.error(`${at.toISOString()} ${task} failed: ${error instanceof Error ? error.message : error}`);
          }
      },
    });
    console.log("Stopped.");
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name the producer's database.");
  if (args.pms !== "mews" && args.pms !== "apaleo") throw new Error("--pms must be mews or apaleo.");
  if (!args.tenant || !args.property) throw new Error("--tenant and --property name what the producer publishes for.");
  const days = whole("days", args.days, 0);
  const options = {
    intervalMs: whole("interval-minutes", args["interval-minutes"], 1) * 60_000,
    retention: { retentionDays: whole("retention-days", args["retention-days"], 1) },
  };
  const target: PollTarget = { tenant: args.tenant, source: args.source ?? `urn:hos:pms:${args.pms}`, propertyId: args.property };
  await produce(target, args.pms === "mews" ? mews(target, days) : apaleo(target, days), options);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

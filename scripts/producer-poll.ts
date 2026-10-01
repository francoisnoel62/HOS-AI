import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Pool } from "pg";

import { createApaleoClient } from "../lib/hos/mappings/apaleo-client";
import { apaleoCapabilities } from "../lib/hos/mappings/apaleo-sync";
import { createMewsClient } from "../lib/hos/mappings/mews-client";
import { mewsCapabilities } from "../lib/hos/mappings/mews-sync";
import type { MappingCapabilities } from "../lib/hos/mappings/sync";
import { apaleoPoll } from "../lib/hos/producer/apaleo-poll";
import { type ProducerConfig, purgeJournal } from "../lib/hos/producer/delivery";
import { producerManifest } from "../lib/hos/producer/manifest";
import { mewsPoll } from "../lib/hos/producer/mews-poll";
import { type Poll, pollEvery, pollingDefaults, pollOnce, type PollOutcome, type PollTarget } from "../lib/hos/producer/poll";

// Runs the pilot's persistent producer for one PMS property (FO-02 of FINISH-OBSERVE). It polls the PMS every
// --interval-minutes, writes what the adapter makes of each poll to the producer's database, and purges the journal
// beyond --retention-days once a day. It reads the database from DATABASE_URL and never writes to the PMS.
//
//   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run producer:poll -- --pms mews --tenant <tenant> --property <property id>
//   APALEO_CLIENT_ID=… APALEO_CLIENT_SECRET=… npm run producer:poll -- --pms apaleo --apaleo-property MUC --tenant <tenant> --property <property id>
//
// --property is the HOS property id the facts carry. --source defaults to urn:hos:pms:<pms>. --days, 2 by default, is how
// far ahead of today each poll reads reservations. --once runs a single poll. --manifest writes the producer's manifest
// to a file. Ctrl+C stops after the poll under way; the next start resumes from what the database holds.
//
// Mews: MEWS_PLATFORM_ADDRESS defaults to https://api.mews-demo.com, whose demo tokens Mews publishes in its Connector API
// documentation. MEWS_SERVICE_IDS, comma-separated, overrides the accommodation services.
//
// Apaleo: the credentials of a simple client (custom app) of the account; a read-only app is enough. --apaleo-property
// is the Apaleo property id, and --inspections says the property inspects its rooms, so that Clean means inspected.
// APALEO_IDENTITY_ADDRESS and APALEO_API_ADDRESS default to Apaleo's production hosts.

const { values: args } = parseArgs({
  options: {
    pms: { type: "string" },
    tenant: { type: "string" },
    property: { type: "string" },
    source: { type: "string" },
    "apaleo-property": { type: "string" },
    inspections: { type: "boolean", default: false },
    days: { type: "string", default: "2" },
    "interval-minutes": { type: "string", default: String(pollingDefaults.intervalMs / 60_000) },
    "retention-days": { type: "string", default: "30" },
    manifest: { type: "string" },
    once: { type: "boolean", default: false },
  },
});

function mews(target: PollTarget, days: number) {
  const clientToken = process.env.MEWS_CLIENT_TOKEN;
  const accessToken = process.env.MEWS_ACCESS_TOKEN;
  if (!clientToken || !accessToken) throw new Error("Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN.");
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
  return { capabilities: mewsCapabilities, poll: mewsPoll(client, { ...target, days, serviceIds }) };
}

function apaleo(target: PollTarget, days: number) {
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
  return { capabilities: apaleoCapabilities, poll: apaleoPoll(client, { ...target, apaleoPropertyId, inspections: args.inspections, days }) };
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

async function produce<State>(
  target: PollTarget,
  { capabilities, poll }: { capabilities: MappingCapabilities; poll: Poll<State> },
  { intervalMs, retention }: { intervalMs: number; retention: ProducerConfig },
) {
  if (args.manifest) {
    writeFileSync(args.manifest, `${JSON.stringify(producerManifest(target, capabilities, retention), null, 2)}\n`);
    console.log(`Manifest written to ${args.manifest}.`);
  }

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
    let purgedAt = 0;
    console.log(`Polling ${target.source} for ${target.tenant}, ${target.propertyId}, every ${intervalMs / 60_000} minute(s). Ctrl+C stops.`);
    await pollEvery(pool, target, poll, {
      intervalMs,
      signal: stop.signal,
      onPoll: async (outcome, at) => {
        log(outcome, at);
        // Once a day, the journal beyond retention is purged.
        if (at.getTime() - purgedAt < 86_400_000) return;
        purgedAt = at.getTime();
        try {
          const { purged } = await purgeJournal(pool, target, retention, at);
          if (purged) console.log(`${at.toISOString()} purge: ${purged} fact(s) beyond ${retention.retentionDays} days.`);
        } catch (error) {
          console.error(`${at.toISOString()} purge failed: ${error instanceof Error ? error.message : error}`);
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
  if (args.pms === "mews") await produce(target, mews(target, days), options);
  else await produce(target, apaleo(target, days), options);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

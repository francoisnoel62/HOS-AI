import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Pool } from "pg";

import { createMewsClient } from "../lib/hos/mappings/mews-client";
import { mewsCapabilities } from "../lib/hos/mappings/mews-sync";
import { purgeJournal } from "../lib/hos/producer/delivery";
import { producerManifest } from "../lib/hos/producer/manifest";
import { mewsPoll } from "../lib/hos/producer/mews-poll";
import { pollEvery, pollingDefaults, pollOnce, type PollTarget } from "../lib/hos/producer/poll";

// Runs the pilot's persistent producer for one PMS property (FO-02 of FINISH-OBSERVE). It polls the PMS every
// --interval-minutes, writes what the adapter makes of each poll to the producer's database, and purges the journal
// beyond --retention-days once a day. It reads the database from DATABASE_URL and never writes to the PMS.
//
//   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run producer:poll -- --pms mews --tenant <tenant> --property <property id>
//
// --source defaults to urn:hos:pms:<pms>. --days, 2 by default, is how far ahead of today each poll reads reservations.
// --once runs a single poll. --manifest writes the producer's manifest to a file. Ctrl+C stops after the poll under way;
// the next start resumes from what the database holds.
//
// Mews: MEWS_PLATFORM_ADDRESS defaults to https://api.mews-demo.com, whose demo tokens Mews publishes in its Connector API
// documentation. MEWS_SERVICE_IDS, comma-separated, overrides the accommodation services.

const { values: args } = parseArgs({
  options: {
    pms: { type: "string" },
    tenant: { type: "string" },
    property: { type: "string" },
    source: { type: "string" },
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

const whole = (name: string, value: string | undefined, min: number) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) throw new Error(`--${name} must be a whole number, at least ${min}: ${value}.`);
  return number;
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name the producer's database.");
  if (args.pms !== "mews") throw new Error("--pms must be mews.");
  if (!args.tenant || !args.property) throw new Error("--tenant and --property name what the producer publishes for.");
  const days = whole("days", args.days, 0);
  const intervalMs = whole("interval-minutes", args["interval-minutes"], 1) * 60_000;
  const retention = { retentionDays: whole("retention-days", args["retention-days"], 1) };
  const target: PollTarget = { tenant: args.tenant, source: args.source ?? `urn:hos:pms:${args.pms}`, propertyId: args.property };
  const { capabilities, poll } = mews(target, days);

  if (args.manifest) {
    writeFileSync(args.manifest, `${JSON.stringify(producerManifest(target, capabilities, retention), null, 2)}\n`);
    console.log(`Manifest written to ${args.manifest}.`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const log = (outcome: Awaited<ReturnType<typeof pollOnce>>, at: Date) =>
    console.log(
      outcome.ok
        ? `${at.toISOString()} poll: ${outcome.result.appended.length} new fact(s), ${outcome.result.repeated.length} already written` +
            (outcome.result.changed.length ? `, ${outcome.result.changed.length} refused under an existing id` : "")
        : `${at.toISOString()} poll failed: ${outcome.error}`,
    );
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

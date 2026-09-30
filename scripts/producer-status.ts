import { parseArgs } from "node:util";

import { Pool } from "pg";

import { pollingDefaults, readSyncStatuses } from "../lib/hos/producer/poll";

// Prints the synchronisation status of one of the pilot's persistent producers, per property: when it last polled its
// source successfully, its last error, and whether its facts may be out of date. It reads the database from
// DATABASE_URL, and exits with 1 when a property's facts are stale.
//
//   npm run producer:status -- --tenant <tenant> --source <source> [--stale-after-minutes 10]

const { values: args } = parseArgs({
  options: {
    tenant: { type: "string" },
    source: { type: "string" },
    "stale-after-minutes": { type: "string" },
  },
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name the producer's database.");
  if (!args.tenant || !args.source) throw new Error("--tenant and --source name the producer.");
  const minutes = args["stale-after-minutes"] === undefined ? pollingDefaults.staleAfterMs / 60_000 : Number(args["stale-after-minutes"]);
  if (!(minutes > 0)) throw new Error(`--stale-after-minutes is a number of minutes: ${args["stale-after-minutes"]}.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const statuses = await readSyncStatuses(pool, { tenant: args.tenant, source: args.source }, { staleAfterMs: minutes * 60_000 });
    if (!statuses.length) console.log("No property of this producer has been polled.");
    for (const status of statuses) {
      const state = status.stale ? "STALE" : "fresh";
      console.log(`${status.propertyId}: ${state}${status.resuming ? ", resuming" : ""}`);
      console.log(`  last success: ${status.lastSuccessAt ?? "never"}; last attempt: ${status.lastAttemptAt ?? "never"}`);
      if (status.consecutiveFailures) console.log(`  ${status.consecutiveFailures} failure(s) in a row`);
      if (status.lastError) console.log(`  last error, ${status.lastErrorAt}: ${status.lastError}`);
    }
    if (!statuses.length || statuses.some((status) => status.stale)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Pool } from "pg";

import { exportJournal } from "../lib/hos/producer/delivery";

// Writes the journal of one of the pilot's persistent producers as JSON Lines, the replay format of HOS Events: every
// fact, the facts after a position, or those recorded since a time. It reads the database from DATABASE_URL.
//
//   npm run producer:export -- --tenant <tenant> --source <source> --out facts.jsonl
//   npm run producer:export -- --tenant <tenant> --source <source> --after 1200 --out facts.jsonl
//   npm run producer:export -- --tenant <tenant> --source <source> --since 2026-09-01T00:00:00Z --out facts.jsonl
//
// Without --out, the facts go to the standard output. The summary goes to the standard error.

const { values: args } = parseArgs({
  options: {
    tenant: { type: "string" },
    source: { type: "string" },
    after: { type: "string" },
    since: { type: "string" },
    out: { type: "string" },
  },
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name the producer's database.");
  if (!args.tenant || !args.source) throw new Error("--tenant and --source name the producer.");
  const after = args.after === undefined ? undefined : Number(args.after);
  if (after !== undefined && !Number.isSafeInteger(after)) throw new Error(`--after is a position: ${args.after}.`);
  if (args.since !== undefined && Number.isNaN(Date.parse(args.since))) throw new Error(`--since is a time: ${args.since}.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const exported = await exportJournal(pool, { tenant: args.tenant, source: args.source }, { after, since: args.since });
    if (args.out) writeFileSync(args.out, exported.jsonl);
    else process.stdout.write(exported.jsonl);
    console.error(`${exported.facts} fact(s)${exported.last === null ? "" : `, through position ${exported.last}`}.`);
    if ((after ?? 0) < exported.purgedThrough)
      console.error(`Retention has purged the journal through position ${exported.purgedThrough}: the facts before it are gone.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

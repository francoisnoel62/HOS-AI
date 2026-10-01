import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { HosFact } from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { Pool } from "pg";

import { loadTrustedManifests, type TrustConfiguration } from "../lib/hos/consumer/trust";
import { readSyncStatuses } from "../lib/hos/producer/poll";
import { readJournal } from "../lib/hos/producer/store";

// Runs the pilot's consumer side once (FO-03 of FINISH-OBSERVE). It verifies the manifest of every producer its trust
// configuration names, reads their facts for a tenant from the producers' database, and replays them through the
// arrival-readiness projection under the trusted manifests only. It prints why each manifest is trusted or not, how the
// facts were handled, whether each property's facts may be out of date, and the stays expected in the next 24 hours.
//
//   DATABASE_URL=… npm run consumer:observe -- --trust trust.json --tenant <tenant> [--ready clean,inspected]
//
// --ready lists the housekeeping statuses that make a room ready: inspected alone for a property that inspects its
// rooms. It exits with 1 when a configured producer's manifest is not trusted, or a property's facts may be stale.

const { values: args } = parseArgs({
  options: {
    trust: { type: "string" },
    tenant: { type: "string" },
    ready: { type: "string", default: "clean,inspected" },
  },
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name the producers' database.");
  if (!args.trust || !args.tenant) throw new Error("--trust names the trust configuration, and --tenant the tenant to observe.");
  const configuration = JSON.parse(readFileSync(args.trust, "utf8")) as TrustConfiguration;
  const now = new Date();
  let healthy = true;

  console.log("Manifests");
  const { manifests, verdicts } = await loadTrustedManifests(configuration, { now });
  for (const verdict of verdicts) {
    if (verdict.trusted) console.log(`  ✓ ${verdict.producer}: trusted, signed with key ${verdict.kid}, until ${verdict.expiresAt}`);
    else {
      healthy = false;
      console.log(`  ✗ ${verdict.producer}: not trusted (${verdict.error.replaceAll("_", " ")}). ${verdict.reason}`);
      console.log("    Its facts are processed as undeclared: nothing it says is applied.");
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const facts: HosFact[] = [];
    console.log("Freshness");
    for (const { producer } of configuration.producers) {
      const key = { tenant: args.tenant, source: producer };
      facts.push(...(await readJournal(pool, key)).map(({ line }) => JSON.parse(line) as HosFact));
      for (const status of await readSyncStatuses(pool, key, { now })) {
        if (status.stale) healthy = false;
        console.log(
          `  ${status.stale ? "✗" : "✓"} ${producer}, ${status.propertyId}: ${status.stale ? "STALE, its facts may be out of date" : "fresh"}` +
            `; last success ${status.lastSuccessAt ?? "never"}${status.lastError && status.consecutiveFailures ? `; failing: ${status.lastError}` : ""}`,
        );
      }
    }

    const steps = replayArrivalReadiness(facts, manifests, { ready_housekeeping_statuses: args.ready!.split(",").map((status) => status.trim()) });
    console.log("Facts");
    for (const { producer } of configuration.producers) {
      const handled: Record<string, number> = {};
      for (const step of steps) if (step.event.source === producer) handled[step.disposition] = (handled[step.disposition] ?? 0) + 1;
      const counts = Object.entries(handled).map(([disposition, count]) => `${count} ${disposition.replaceAll("_", " ")}`);
      console.log(`  ${producer}: ${counts.join(", ") || "none"}`);
    }

    const upcoming = Object.values(steps.at(-1)?.stays ?? {})
      .filter((stay) => stay.stay_status === "expected")
      .filter((stay) => {
        const arrival = Date.parse(stay.planned_arrival_at) - now.getTime();
        return arrival > -12 * 3_600_000 && arrival < 24 * 3_600_000;
      })
      .sort((a, b) => a.planned_arrival_at.localeCompare(b.planned_arrival_at));
    console.log(`Stays expected in the next 24 hours: ${upcoming.length}`);
    for (const stay of upcoming)
      console.log(
        `  ${stay.planned_arrival_at} ${stay.stay_id} in ${stay.unit_id ?? "no room yet"}: ${stay.readiness.replaceAll("_", " ")}` +
          `${stay.situation === "at_risk" ? ", AT RISK" : ""}${stay.conflicts.length ? `, ${stay.conflicts.length} observation(s) from other sources` : ""}`,
      );
  } finally {
    await pool.end();
  }
  if (!healthy) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

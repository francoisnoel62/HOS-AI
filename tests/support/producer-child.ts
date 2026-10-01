import { Pool } from "pg";

import { createMewsAdapter, type MewsAdapterState } from "@/lib/hos/mappings/mews";
import { acknowledge, readPending } from "@/lib/hos/producer/delivery";
import { processDelivery } from "@/lib/hos/producer/store";
import { mewsAdapterConfig, mewsDelivery, mewsRecording } from "@/tests/support/mews-recording";

// A producer or consumer process that tests/unit/producer-recovery.test.ts starts, kills and starts again. It prints
// each step it completes, and with HANG it stops at that step and waits to be killed:
//
//   MODE=produce TENANT=… STEPS=0,1,2,3 [HANG=2]   writes the recorded Mews deliveries, each as one delivery; HANG holds
//                                                 the transaction of that delivery open
//   MODE=consume TENANT=… CONSUMER=…    [HANG=1]   reads what the consumer has not acknowledged, then acknowledges it;
//                                                 HANG stops between the reading and the acknowledgment

const { MODE, TENANT, STEPS = "", HANG, CONSUMER = "projection", HOS_TEST_DATABASE_URL } = process.env;

// Waits forever: only a kill ends the process.
const hang = (label: string) => {
  console.log(`hanging ${label}`);
  setInterval(() => undefined, 60_000);
  return new Promise<never>(() => undefined);
};

async function main() {
  const pool = new Pool({ connectionString: HOS_TEST_DATABASE_URL });
  const key = { tenant: TENANT!, source: mewsRecording.adapter.source };
  if (MODE === "produce") {
    for (const step of STEPS.split(",").map(Number)) {
      await processDelivery<MewsAdapterState>(pool, key, async ({ state, identities }) => {
        const adapter = createMewsAdapter(mewsAdapterConfig(key.tenant, identities), state);
        const events = adapter.handle(mewsDelivery(mewsRecording.deliveries[step])).events;
        if (String(step) === HANG) await hang(String(step));
        return { events, state: adapter.state() };
      });
      console.log(`written ${step}`);
    }
  } else {
    const pending = await readPending(pool, key, CONSUMER);
    console.log(`read ${pending.map(({ seq }) => seq).join(",")}`);
    if (HANG) await hang("before acknowledging");
    if (pending.length) await acknowledge(pool, key, CONSUMER, pending.at(-1)!.seq);
    console.log("acknowledged");
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

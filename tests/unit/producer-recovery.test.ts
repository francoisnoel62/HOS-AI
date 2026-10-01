// @vitest-environment node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createIdentityRegistry, type Crosswalk, type HosFact } from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RecordedDelivery } from "@/lib/hos/mappings/common";
import { createMewsAdapter, type MewsAdapterState, type MewsDelivery, type MewsReservation } from "@/lib/hos/mappings/mews";
import { mewsCapabilities } from "@/lib/hos/mappings/mews-sync";
import { exportJournal } from "@/lib/hos/producer/delivery";
import { producerManifest } from "@/lib/hos/producer/manifest";
import { processDelivery, type ProducerKey, readCrosswalk, readJournal } from "@/lib/hos/producer/store";
import { mewsAdapterConfig, mewsDelivery, mewsRecording } from "@/tests/support/mews-recording";

// The recovery tests of FO-02: the producer and a consumer are separate processes, killed outright in the middle of
// their work and started again. They need the test database of tests/unit/producer-store.test.ts.
const url = process.env.HOS_TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("The CI must set HOS_TEST_DATABASE_URL for the producer recovery tests.");

const [property] = mewsRecording.adapter.properties as Array<{ propertyId: string }>;
const projection = { ready_housekeeping_statuses: ["clean", "inspected"] };

// Runs tests/support/producer-child.ts, and kills it outright once its output shows killOn.
function child(env: Record<string, string>, killOn?: string) {
  return new Promise<{ output: string; killed: boolean; code: number | null }>((resolve, reject) => {
    const running = spawn(process.execPath, ["--import", "tsx", "tests/support/producer-child.ts"], {
      env: { ...process.env, HOS_TEST_DATABASE_URL: url, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let killed = false;
    const timer = setTimeout(() => {
      running.kill("SIGKILL");
      reject(new Error(`The child process did not end: ${output}`));
    }, 60_000);
    running.stdout.on("data", (chunk) => {
      output += chunk;
      if (killOn && !killed && output.includes(killOn)) {
        killed = true;
        running.kill("SIGKILL");
      }
    });
    running.stderr.on("data", (chunk) => (output += chunk));
    running.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ output, killed, code });
    });
  });
}

describe.skipIf(!url)("Pilot producer recovery", () => {
  let pool: Pool;
  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });
  afterAll(() => pool?.end());

  const producer = (): ProducerKey => ({ tenant: `tenant_${randomUUID().slice(0, 8)}`, source: mewsRecording.adapter.source });
  const facts = async (key: ProducerKey) => (await readJournal(pool, key)).map(({ line }) => JSON.parse(line) as HosFact);
  const manifest = (key: ProducerKey) => producerManifest({ ...key, propertyId: property.propertyId }, mewsCapabilities, { retentionDays: 30 });
  // The facts of the given deliveries through one Mews adapter that never stopped, with the ids the producer stored.
  const uninterrupted = (key: ProducerKey, crosswalk: Crosswalk, deliveries: MewsDelivery[]) => {
    const adapter = createMewsAdapter(mewsAdapterConfig(key.tenant, createIdentityRegistry(crosswalk)));
    return deliveries.flatMap((delivery) => adapter.handle(delivery).events);
  };
  // The arrival-readiness projection's last view of each stay, under the Mews ids, so producers with ids of their own compare.
  const view = async (key: ProducerKey, events: HosFact[]) => {
    const sourceIds = new Map(
      Object.values(await readCrosswalk(pool, key)).flatMap((ids) => Object.entries(ids ?? {}).map(([source, hos]) => [hos, source])),
    );
    const stays = Object.values(replayArrivalReadiness(events, [manifest(key)], projection).at(-1)?.stays ?? {});
    return stays
      .map((stay) => ({
        stay: sourceIds.get(stay.stay_id),
        unit: stay.unit_id ? sourceIds.get(stay.unit_id) : null,
        status: stay.stay_status,
        housekeeping: stay.housekeeping?.value ?? null,
        readiness: stay.readiness,
        situation: stay.situation,
      }))
      .sort((a, b) => String(a.stay).localeCompare(String(b.stay)));
  };

  it("loses and changes no fact when killed inside a delivery, and carries on after a restart", async () => {
    const key = producer();
    const killed = await child({ MODE: "produce", TENANT: key.tenant, STEPS: "0,1,2,3", HANG: "2" }, "hanging 2");
    expect(killed).toMatchObject({ killed: true });
    expect(killed.output).toContain("written 1");
    expect(killed.output).not.toContain("written 2");
    const journal = await readJournal(pool, key);
    const crosswalk = await readCrosswalk(pool, key);
    expect(journal.length).toBeGreaterThan(0);

    const restarted = await child({ MODE: "produce", TENANT: key.tenant, STEPS: "2,3" });
    expect(restarted).toMatchObject({ code: 0, killed: false });
    expect(restarted.output).toContain("written 3");

    // What was written before the kill is still there, unchanged, and every id given before it is kept.
    expect((await readJournal(pool, key)).slice(0, journal.length)).toEqual(journal);
    const after = await readCrosswalk(pool, key);
    for (const [kind, ids] of Object.entries(crosswalk)) expect(after[kind as keyof Crosswalk]).toMatchObject(ids!);
    // The journal holds what a producer that never stopped would have published, and the projection sees the same.
    const expected = uninterrupted(
      key,
      after,
      mewsRecording.deliveries.map((delivery) => mewsDelivery(delivery)),
    );
    expect(await facts(key)).toEqual(expected);
    expect(await view(key, await facts(key))).toEqual(await view(key, expected));
  });

  it("gives a consumer killed between reading and acknowledging the same facts again", async () => {
    const key = producer();
    expect(await child({ MODE: "produce", TENANT: key.tenant, STEPS: "0,1,2,3" })).toMatchObject({ code: 0 });
    const positions = (await readJournal(pool, key)).map(({ seq }) => seq).join(",");

    const killed = await child({ MODE: "consume", TENANT: key.tenant, HANG: "1" }, "hanging before acknowledging");
    expect(killed.output).toContain(`read ${positions}`);
    const again = await child({ MODE: "consume", TENANT: key.tenant });
    expect(again.output).toContain(`read ${positions}`);
    expect(again.output).toContain("acknowledged");
    expect((await child({ MODE: "consume", TENANT: key.tenant })).output).toContain("read \n");
  });

  it("rebuilds the same projection from the JSON Lines export, replayed twice", async () => {
    const key = producer();
    expect(await child({ MODE: "produce", TENANT: key.tenant, STEPS: "0,1,2,3" })).toMatchObject({ code: 0 });
    const replayed = (await exportJournal(pool, key)).jsonl
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HosFact);
    const twice = replayArrivalReadiness([...replayed, ...replayed], [manifest(key)], projection);
    expect(twice.slice(replayed.length).every((step) => step.disposition === "duplicate")).toBe(true);
    expect(await view(key, [...replayed, ...replayed])).toEqual(await view(key, await facts(key)));
  });

  it("reaches the same projection whatever order the deliveries arrive in, and adds only a new entity's facts", async () => {
    const [inOrder, reordered] = [producer(), producer()];
    const deliver = (key: ProducerKey, delivery: MewsDelivery) =>
      processDelivery<MewsAdapterState>(pool, key, ({ state, identities }) => {
        const adapter = createMewsAdapter(mewsAdapterConfig(key.tenant, identities), state);
        return { events: adapter.handle(delivery).events, state: adapter.state() };
      });
    const recorded = (index: number) => mewsDelivery(mewsRecording.deliveries[index] as RecordedDelivery);
    for (const index of [0, 1, 2, 3]) await deliver(inOrder, recorded(index));
    // The room's status before the assignment.
    for (const index of [0, 2, 1, 3]) await deliver(reordered, recorded(index));
    expect(await view(reordered, await facts(reordered))).toEqual(await view(inOrder, await facts(inOrder)));

    // A reservation Mews had not sent yet.
    const journal = await readJournal(pool, inOrder);
    const first = recorded(0);
    const added: MewsReservation = { ...first.reservations![0], Id: "5b9c1d2e-3f40-4a51-8b62-7c83d94ea5f6", Number: "4321" };
    const { appended } = await deliver(inOrder, {
      ...first,
      webhook: { ...first.webhook, Events: [{ Discriminator: "ServiceOrderUpdated", Value: { Id: added.Id } }] },
      reservations: [added],
    });
    const reservationId = (await readCrosswalk(pool, inOrder)).reservation?.[added.Id];
    expect(appended.map((event) => event.type)).toEqual(["reservation.created", "stay.expected"]);
    expect(appended.every((event) => event.hossubjects.split(" ").includes(`reservation:${reservationId}`))).toBe(true);
    expect((await readJournal(pool, inOrder)).slice(0, journal.length)).toEqual(journal);
  });
});

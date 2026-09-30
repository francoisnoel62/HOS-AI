// @vitest-environment node
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createIdentityRegistry, type HosFact, type IdentityRegistry } from "@hos-ai/sdk";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RecordedDelivery } from "@/lib/hos/mappings/common";
import {
  createMewsAdapter,
  type MewsAdapterConfig,
  type MewsAdapterState,
  type MewsDelivery,
  type MewsReservation,
  type MewsResource,
  type MewsWebhook,
} from "@/lib/hos/mappings/mews";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { processDelivery, type ProducerKey, readCrosswalk, readJournal } from "@/lib/hos/producer/store";

// These tests need a Postgres database of their own, named by HOS_TEST_DATABASE_URL; the CI provides one. Locally, with
// the Postgres of docker-compose.yml: create it with `docker exec hos-ai-postgres createdb -U hos hos_ai_test`, then set
// HOS_TEST_DATABASE_URL=postgres://hos:hos@localhost:5432/hos_ai_test.
const url = process.env.HOS_TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("The CI must set HOS_TEST_DATABASE_URL for the producer storage tests.");

const recording = loadRecording("mews");

// A recorded Mews delivery as the adapter receives it, or as if received at another time.
function delivery({ received_at, webhook, fetched }: RecordedDelivery, at = received_at): MewsDelivery {
  const responses = fetched.map((call) => call.response as { Reservations?: MewsReservation[]; Resources?: MewsResource[] });
  return {
    received_at: at,
    webhook: webhook as MewsWebhook,
    reservations: responses.flatMap((response) => response.Reservations ?? []),
    resources: responses.flatMap((response) => response.Resources ?? []),
  };
}

describe.skipIf(!url)("Producer storage in Postgres", () => {
  let pool: Pool;
  beforeAll(() => {
    // The site's own migrations, applied to the test database.
    execSync("npx tsx scripts/migrate.ts", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url });
  });
  afterAll(() => pool?.end());

  // Each test has a tenant of its own, so the tests never see each other's rows.
  const producer = (): ProducerKey => ({ tenant: `tenant_${randomUUID().slice(0, 8)}`, source: recording.adapter.source });
  const config = ({ tenant }: ProducerKey, identities: IdentityRegistry): MewsAdapterConfig => ({
    ...(recording.adapter as unknown as MewsAdapterConfig),
    tenant,
    identities,
  });
  // One delivery through a Mews adapter started from the stored state, as the producer runs each delivery.
  const deliver = (key: ProducerKey, recorded: RecordedDelivery, at?: string) =>
    processDelivery<MewsAdapterState>(pool, key, ({ state, identities }) => {
      const adapter = createMewsAdapter(config(key, identities), state);
      return { events: adapter.handle(delivery(recorded, at)).events, state: adapter.state() };
    });
  const facts = async (key: ProducerKey) => (await readJournal(pool, key)).map(({ line }) => JSON.parse(line) as HosFact);

  it("writes the facts, the new ids and the adapter's state of each delivery, so the next adapter carries on", async () => {
    const key = producer();
    for (const recorded of recording.deliveries) await deliver(key, recorded);

    // The same deliveries through one adapter that never stopped, with the ids the producer stored.
    const uninterrupted = createMewsAdapter(config(key, createIdentityRegistry(await readCrosswalk(pool, key))));
    const expected = recording.deliveries.flatMap((recorded) => uninterrupted.handle(delivery(recorded)).events);
    expect(expected.length).toBeGreaterThan(0);
    expect(await facts(key)).toEqual(expected);
  });

  it("keeps a redelivered fact as it was first written, hosrecordedat included", async () => {
    const key = producer();
    const [first] = recording.deliveries;
    const written = await deliver(key, first);
    expect(written.appended.length).toBeGreaterThan(0);
    const journal = await readJournal(pool, key);

    // An adapter that lost its state, as after a crash before it was stored, publishes the same facts again, later.
    const again = await processDelivery<MewsAdapterState>(pool, key, ({ identities }) => {
      const adapter = createMewsAdapter(config(key, identities));
      return { events: adapter.handle(delivery(first, "2026-07-12T15:00:00Z")).events, state: adapter.state() };
    });
    expect(again).toEqual({ appended: [], repeated: written.appended.map((event) => event.id), changed: [] });
    expect(await readJournal(pool, key)).toEqual(journal);
  });

  it("reports another fact under an existing id, and keeps the first", async () => {
    const key = producer();
    const { appended } = await deliver(key, recording.deliveries[0]);
    const journal = await readJournal(pool, key);
    const [created] = appended;
    const other = { ...created, data: { ...created.data, planned_departure_date: "2026-08-30" } } as HosFact;
    const result = await processDelivery(pool, key, ({ state }) => ({ events: [other], state }));
    expect(result).toEqual({ appended: [], repeated: [created.id], changed: [created.id] });
    expect(await readJournal(pool, key)).toEqual(journal);
  });

  it("writes nothing of a failed delivery, new ids included", async () => {
    const key = producer();
    await deliver(key, recording.deliveries[0]);
    const journal = await readJournal(pool, key);
    const crosswalk = await readCrosswalk(pool, key);

    // The adapter fails after giving the room its HOS id.
    await expect(
      processDelivery<MewsAdapterState>(pool, key, ({ state, identities }) => {
        createMewsAdapter(config(key, identities), state).handle(delivery(recording.deliveries[2]));
        throw new Error("Mews returned a payload the adapter cannot read.");
      }),
    ).rejects.toThrow("Mews returned a payload the adapter cannot read.");
    // A fact that fails validation fails the delivery too.
    await expect(
      processDelivery<MewsAdapterState>(pool, key, ({ state, identities }) => {
        const adapter = createMewsAdapter(config(key, identities), state);
        const events = adapter.handle(delivery(recording.deliveries[1])).events;
        return { events: events.map((event) => ({ ...event, specversion: "0.3" }) as unknown as HosFact), state: adapter.state() };
      }),
    ).rejects.toThrow(/^Invalid HOS fact/);

    expect(await readJournal(pool, key)).toEqual(journal);
    expect(await readCrosswalk(pool, key)).toEqual(crosswalk);
    // The stored state is still the one before them, so the next delivery publishes what they did not.
    expect((await deliver(key, recording.deliveries[1])).appended.map((event) => event.type)).toEqual(["stay.unit_assigned"]);
  });

  it("keeps two tenants apart", async () => {
    const [first, second] = [producer(), producer()];
    for (const key of [first, second]) for (const recorded of recording.deliveries) await deliver(key, recorded);

    const ids = async (key: ProducerKey) => Object.values(await readCrosswalk(pool, key)).flatMap((kind) => Object.values(kind ?? {}));
    const [firstIds, secondIds] = [await ids(first), await ids(second)];
    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds).toHaveLength(firstIds.length);
    // The same Mews entities have ids of their own in each tenant, and each journal holds its tenant's facts only.
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    for (const key of [first, second]) {
      const journal = await facts(key);
      expect(journal.length).toBeGreaterThan(0);
      expect(journal.every((fact) => fact.hostenant === key.tenant)).toBe(true);
    }
  });

  it("writes the deliveries of one producer one after the other", async () => {
    const key = producer();
    type Count = { count: number };
    // Each delivery reads the count, waits so the others try to run meanwhile, then writes it plus one.
    const count = () =>
      processDelivery<Count>(pool, key, async ({ state }) => {
        const seen = state?.count ?? 0;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { events: [], state: { count: seen + 1 } };
      });
    await Promise.all([count(), count(), count(), count(), count()]);

    let stored: Count | undefined;
    await processDelivery<Count>(pool, key, ({ state }) => {
      stored = state;
      return { events: [], state: state! };
    });
    expect(stored).toEqual({ count: 5 });
  });
});

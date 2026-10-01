// @vitest-environment node
import { randomUUID } from "node:crypto";

import { checkProducer, createIdentityRegistry, type HosFact, type IdentityRegistry } from "@hos-ai/sdk";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RecordedDelivery } from "@/lib/hos/mappings/common";
import { createMewsAdapter, type MewsAdapterState } from "@/lib/hos/mappings/mews";
import { mewsCapabilities } from "@/lib/hos/mappings/mews-sync";
import { acknowledge, exportJournal, JournalGap, purgeJournal, readPending } from "@/lib/hos/producer/delivery";
import { producerManifest } from "@/lib/hos/producer/manifest";
import { markStarted, type Poll, pollEvery, pollOnce, type PollOutcome, readSyncStatus } from "@/lib/hos/producer/poll";
import { processDelivery, type ProducerKey, readCrosswalk, readJournal } from "@/lib/hos/producer/store";
import { mewsAdapterConfig, mewsDelivery as delivery, mewsRecording as recording } from "@/tests/support/mews-recording";

// These tests need a Postgres database of their own, named by HOS_TEST_DATABASE_URL; the CI provides one, and
// tests/support/database.ts applies the migrations to it. Locally, with the Postgres of docker-compose.yml: create it with
// `docker exec hos-ai-postgres createdb -U hos hos_ai_test`, then set
// HOS_TEST_DATABASE_URL=postgres://hos:hos@localhost:5432/hos_ai_test.
const url = process.env.HOS_TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("The CI must set HOS_TEST_DATABASE_URL for the producer storage tests.");

describe.skipIf(!url)("Pilot producer in Postgres", () => {
  let pool: Pool;
  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });
  afterAll(() => pool?.end());

  // Each test has a tenant of its own, so the tests never see each other's rows.
  const producer = (): ProducerKey => ({ tenant: `tenant_${randomUUID().slice(0, 8)}`, source: recording.adapter.source });
  const config = ({ tenant }: ProducerKey, identities: IdentityRegistry) => mewsAdapterConfig(tenant, identities);
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

  it("delivers every fact at least once, from each consumer's own position", async () => {
    const key = producer();
    const [first, second, ...rest] = recording.deliveries;
    await deliver(key, first);
    await deliver(key, second);
    const pending = await readPending(pool, key, "projection");
    expect(pending).toEqual(await readJournal(pool, key));
    // A consumer that stopped before acknowledging gets the same facts again.
    expect(await readPending(pool, key, "projection")).toEqual(pending);
    const read = pending.at(-1)!.seq;
    await acknowledge(pool, key, "projection", read);
    expect(await readPending(pool, key, "projection")).toEqual([]);

    for (const recorded of rest) await deliver(key, recorded);
    const later = await readPending(pool, key, "projection");
    expect(later.length).toBeGreaterThan(0);
    expect(later.every(({ seq }) => seq > read)).toBe(true);
    // Another consumer reads from its own position: the start of the journal, a page at a time.
    expect(await readPending(pool, key, "export")).toEqual(await readJournal(pool, key));
    expect(await readPending(pool, key, "export", 1)).toEqual(pending.slice(0, 1));
  });

  it("moves a position only forward, and never beyond the journal", async () => {
    const key = producer();
    for (const recorded of recording.deliveries) await deliver(key, recorded);
    const journal = await readJournal(pool, key);
    await acknowledge(pool, key, "projection", journal.at(-1)!.seq);
    await acknowledge(pool, key, "projection", journal[0].seq);
    expect(await readPending(pool, key, "projection")).toEqual([]);
    await expect(acknowledge(pool, key, "projection", journal.at(-1)!.seq + 1)).rejects.toThrow(/is not in the journal/);
    await expect(acknowledge(pool, producer(), "projection", 1)).rejects.toThrow(/is not in the journal/);
  });

  it("exports the journal as JSON Lines that pass the producer check against the producer's manifest", async () => {
    const key = producer();
    for (const recorded of recording.deliveries) await deliver(key, recorded);
    const journal = await readJournal(pool, key);
    const all = await exportJournal(pool, key);
    expect(all).toMatchObject({ facts: journal.length, last: journal.at(-1)!.seq, purgedThrough: 0 });
    expect(all.jsonl).toBe(journal.map(({ line }) => `${line}\n`).join(""));

    const [{ propertyId }] = recording.adapter.properties as Array<{ propertyId: string }>;
    const manifest = producerManifest({ ...key, propertyId }, mewsCapabilities, { retentionDays: 30 });
    expect(checkProducer({ manifest, recording: all.jsonl })).toMatchObject({ valid: true });

    // After a position, or recorded since a time.
    expect((await exportJournal(pool, key, { after: journal[0].seq })).facts).toBe(journal.length - 1);
    const recorded = (entry: { line: string }) => (JSON.parse(entry.line) as HosFact).hosrecordedat;
    const since = recorded(journal.at(-1)!);
    expect((await exportJournal(pool, key, { since })).facts).toBe(journal.filter((entry) => recorded(entry) >= since).length);
  });

  it("purges expired facts from the start of the journal only, and tells a consumer that missed them", async () => {
    const key = producer();
    const [first, second, third] = recording.deliveries;
    await deliver(key, first, "2026-08-01T09:00:00Z");
    const read = await readPending(pool, key, "early");
    await acknowledge(pool, key, "early", read.at(-1)!.seq);
    await deliver(key, second, "2026-09-29T09:00:00Z");
    // Recorded before the delivery ahead of it, as an old delivery replayed late would be: it stays as long as that one.
    await deliver(key, third, "2026-08-02T09:00:00Z");
    const journal = await readJournal(pool, key);
    const kept = journal.slice(read.length);

    const now = new Date("2026-09-30T12:00:00Z");
    const purged = await purgeJournal(pool, key, { retentionDays: 30 }, now);
    expect(purged).toEqual({ purged: read.length, purgedThrough: read.at(-1)!.seq });
    expect(await readJournal(pool, key)).toEqual(kept);
    expect(await purgeJournal(pool, key, { retentionDays: 30 }, now)).toEqual({ purged: 0, purgedThrough: purged.purgedThrough });
    expect((await exportJournal(pool, key)).purgedThrough).toBe(purged.purgedThrough);

    // The consumer that had read the purged facts carries on; one that had not learns what it missed.
    expect(await readPending(pool, key, "early")).toEqual(kept);
    await expect(readPending(pool, key, "late")).rejects.toThrow(JournalGap);
    await acknowledge(pool, key, "late", purged.purgedThrough);
    expect(await readPending(pool, key, "late")).toEqual(kept);
    await expect(purgeJournal(pool, key, { retentionDays: 0 })).rejects.toThrow(/at least 1/);
  });

  // A poll that reads a recorded Mews delivery as the source, or fails as a PMS can.
  const polling =
    (key: ProducerKey, recorded?: RecordedDelivery): Poll<MewsAdapterState> =>
    async ({ state, identities, now }) => {
      if (!recorded) throw new Error("Mews answered 503: Service Unavailable.");
      const adapter = createMewsAdapter(config(key, identities), state);
      return { events: adapter.handle(delivery(recorded, now.toISOString())).events, state: adapter.state() };
    };
  const at = (minutes: number) => new Date(Date.parse("2026-09-30T08:00:00Z") + minutes * 60_000);

  it("records each poll's outcome per property: the last success, the last error and the failures in a row", async () => {
    const key = producer();
    const target = { ...key, propertyId: "prop_mews" };
    const [first, second] = recording.deliveries;

    expect(await pollOnce(pool, target, polling(key, first), at(0))).toMatchObject({ ok: true });
    expect(await readSyncStatus(pool, target, { now: at(1) })).toMatchObject({
      lastAttemptAt: at(0).toISOString(),
      lastSuccessAt: at(0).toISOString(),
      lastError: null,
      consecutiveFailures: 0,
      stale: false,
    });

    // A failed poll writes no fact and leaves the last success as it was.
    const journal = await readJournal(pool, key);
    expect(await pollOnce(pool, target, polling(key), at(2))).toEqual({ ok: false, error: "Mews answered 503: Service Unavailable." });
    await pollOnce(pool, target, polling(key), at(4));
    expect(await readJournal(pool, key)).toEqual(journal);
    expect(await readSyncStatus(pool, target, { now: at(5) })).toMatchObject({
      lastAttemptAt: at(4).toISOString(),
      lastSuccessAt: at(0).toISOString(),
      lastError: "Mews answered 503: Service Unavailable.",
      lastErrorAt: at(4).toISOString(),
      consecutiveFailures: 2,
    });

    // The next success resets the failures and keeps the last error, for the record.
    expect(await pollOnce(pool, target, polling(key, second), at(6))).toMatchObject({
      ok: true,
      result: { appended: [{ type: "stay.unit_assigned" }] },
    });
    expect(await readSyncStatus(pool, target, { now: at(7) })).toMatchObject({
      lastSuccessAt: at(6).toISOString(),
      lastError: "Mews answered 503: Service Unavailable.",
      consecutiveFailures: 0,
    });
    // Another property of the producer has a status of its own: never polled, so its facts are stale.
    expect(await readSyncStatus(pool, { ...key, propertyId: "prop_other" })).toMatchObject({ lastSuccessAt: null, stale: true, resuming: false });
  });

  it("calls the facts stale after 10 minutes without a successful poll, and resuming from a restart to the next success", async () => {
    const key = producer();
    const target = { ...key, propertyId: "prop_mews" };
    await pollOnce(pool, target, polling(key, recording.deliveries[0]), at(0));
    expect(await readSyncStatus(pool, target, { now: at(10) })).toMatchObject({ stale: false });
    expect(await readSyncStatus(pool, target, { now: new Date(at(10).getTime() + 1000) })).toMatchObject({ stale: true });

    await markStarted(pool, target, at(30));
    expect(await readSyncStatus(pool, target, { now: at(30) })).toMatchObject({ resuming: true, stale: true, startedAt: at(30).toISOString() });
    await pollOnce(pool, target, polling(key), at(31));
    expect(await readSyncStatus(pool, target, { now: at(31) })).toMatchObject({ resuming: true, consecutiveFailures: 1 });
    await pollOnce(pool, target, polling(key, recording.deliveries[1]), at(33));
    expect(await readSyncStatus(pool, target, { now: at(33) })).toMatchObject({ resuming: false, stale: false });
  });

  it("polls at its interval until stopped, and carries on after a failed poll", async () => {
    const key = producer();
    const target = { ...key, propertyId: "prop_mews" };
    const [first, second] = recording.deliveries;
    const sources = [first, undefined, second];
    const outcomes: PollOutcome[] = [];
    const stop = new AbortController();
    let polls = 0;
    await pollEvery<MewsAdapterState>(pool, target, (context) => polling(key, sources[polls++])(context), {
      intervalMs: 20,
      signal: stop.signal,
      onPoll: (outcome) => {
        outcomes.push(outcome);
        if (outcomes.length === sources.length) stop.abort();
      },
    });
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false, true]);
    expect(await readSyncStatus(pool, target)).toMatchObject({ resuming: false, stale: false, consecutiveFailures: 0 });
    expect((await readSyncStatus(pool, target)).startedAt).not.toBeNull();
  });
});

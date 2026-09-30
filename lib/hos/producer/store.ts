import { isDeepStrictEqual } from "node:util";

import { createIdentityRegistry, type Crosswalk, type HosEntityKind, type HosFact, type IdentityRegistry, validateEvent } from "@hos-ai/sdk";
import type { Pool, PoolClient } from "pg";

// The storage of the pilot's persistent reference producer (FO-02 of FINISH-OBSERVE). The crosswalk, the adapter's
// state and the journal of HOS facts live in Postgres, in the hos_producer schema, and each delivery from the source
// system is written in one transaction: a crash leaves the whole delivery or none of it. This storage belongs to the
// pilot's reference implementation; HOS itself requires none.

// A producer: one source system publishing for one tenant.
export type ProducerKey = { tenant: string; source: string };

// What the adapter made of one delivery: its facts, and its state after them.
export type Delivered<State> = { events: HosFact[]; state: State };

export type DeliveryResult = {
  // The facts this delivery added to the journal, in order.
  appended: HosFact[];
  // The ids the journal already had: those facts keep the content they were first written with.
  repeated: string[];
  // Among them, the ids whose new content differs by more than hosrecordedat: the adapter published another fact under
  // an existing id, which the journal did not take.
  changed: string[];
};

type Queryable = Pick<Pool | PoolClient, "query">;

// The HOS id given to each source entity of a producer.
export async function readCrosswalk(db: Queryable, { tenant, source }: ProducerKey): Promise<Crosswalk> {
  const { rows } = await db.query<{ kind: HosEntityKind; source_id: string; hos_id: string }>(
    "SELECT kind, source_id, hos_id FROM hos_producer.identities WHERE tenant = $1 AND source = $2",
    [tenant, source],
  );
  const crosswalk: Crosswalk = {};
  for (const { kind, source_id, hos_id } of rows) (crosswalk[kind] ??= {})[source_id] = hos_id;
  return crosswalk;
}

// The facts of a producer after position after, in the order they were written, as the JSON text first written.
export async function readJournal(db: Queryable, { tenant, source }: ProducerKey, after = 0) {
  const { rows } = await db.query<{ seq: string; fact: string }>(
    "SELECT seq, fact FROM hos_producer.journal WHERE tenant = $1 AND source = $2 AND seq > $3 ORDER BY seq",
    [tenant, source, after],
  );
  return rows.map(({ seq, fact }) => ({ seq: Number(seq), line: fact }));
}

const withoutRecording = ({ hosrecordedat: _recorded, ...fact }: HosFact) => fact;

// Runs one delivery from the source system through deliver, which builds the adapter from the stored state and the
// crosswalk, then writes the new identities, the facts and the adapter's new state together. deliver may fetch from the
// source system: the producer stays locked meanwhile, so a second delivery waits and then reads what this one wrote.
export async function processDelivery<State>(
  pool: Pool,
  producer: ProducerKey,
  deliver: (context: { state: State | undefined; identities: IdentityRegistry }) => Delivered<State> | Promise<Delivered<State>>,
): Promise<DeliveryResult> {
  const { tenant, source } = producer;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO hos_producer.producers (tenant, source) VALUES ($1, $2) ON CONFLICT DO NOTHING", [tenant, source]);
    const {
      rows: [stored],
    } = await client.query<{ adapter_state: State | null }>(
      "SELECT adapter_state FROM hos_producer.producers WHERE tenant = $1 AND source = $2 FOR UPDATE",
      [tenant, source],
    );

    // The stored crosswalk, and the ids this delivery gives for the first time.
    const crosswalk = await readCrosswalk(client, producer);
    const registry = createIdentityRegistry(crosswalk);
    const minted = new Map<string, [HosEntityKind, string, string]>();
    const identities: IdentityRegistry = {
      resolve(kind, sourceId) {
        const hosId = registry.resolve(kind, sourceId);
        if (!crosswalk[kind]?.[sourceId]) minted.set(`${kind}|${sourceId}`, [kind, sourceId, hosId]);
        return hosId;
      },
    };

    const { events, state } = await deliver({ state: stored.adapter_state ?? undefined, identities });
    // An invalid fact fails the whole delivery, so nothing of it is written and the source system delivers it again.
    for (const event of events) if (!validateEvent(event)) throw new Error(`Invalid HOS fact ${event.id}: ${JSON.stringify(validateEvent.errors)}`);

    const ids = [...minted.values()];
    await client.query(
      `INSERT INTO hos_producer.identities (tenant, source, kind, source_id, hos_id)
       SELECT $1, $2, kind, source_id, hos_id FROM unnest($3::text[], $4::text[], $5::text[]) AS t(kind, source_id, hos_id)`,
      [tenant, source, ids.map(([kind]) => kind), ids.map(([, sourceId]) => sourceId), ids.map(([, , hosId]) => hosId)],
    );

    // The journal takes each id once, in the order of the delivery, and keeps the first content of an id it already has.
    const { rows: inserted } = await client.query<{ id: string }>(
      `INSERT INTO hos_producer.journal (tenant, source, id, fact, recorded_at)
       SELECT $1, $2, id, fact, recorded_at
       FROM unnest($3::text[], $4::text[], $5::timestamptz[]) WITH ORDINALITY AS t(id, fact, recorded_at, position)
       ORDER BY position
       ON CONFLICT (tenant, source, id) DO NOTHING
       RETURNING id`,
      [tenant, source, events.map((event) => event.id), events.map((event) => JSON.stringify(event)), events.map((event) => event.hosrecordedat)],
    );
    const fresh = new Set(inserted.map(({ id }) => id));
    const appended: HosFact[] = [];
    const repeated: HosFact[] = [];
    for (const event of events) (fresh.delete(event.id) ? appended : repeated).push(event);
    const changed: string[] = [];
    if (repeated.length) {
      const { rows } = await client.query<{ id: string; fact: string }>(
        "SELECT id, fact FROM hos_producer.journal WHERE tenant = $1 AND source = $2 AND id = ANY($3::text[])",
        [tenant, source, repeated.map((event) => event.id)],
      );
      const first = new Map(rows.map(({ id, fact }) => [id, JSON.parse(fact) as HosFact]));
      for (const event of repeated) if (!isDeepStrictEqual(withoutRecording(first.get(event.id)!), withoutRecording(event))) changed.push(event.id);
    }

    await client.query("UPDATE hos_producer.producers SET adapter_state = $3, updated_at = now() WHERE tenant = $1 AND source = $2", [
      tenant,
      source,
      JSON.stringify(state),
    ]);
    await client.query("COMMIT");
    return { appended, repeated: repeated.map((event) => event.id), changed };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

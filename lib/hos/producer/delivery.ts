import type { Pool } from "pg";

import { type JournalEntry, lockProducer, type ProducerKey, type Queryable, readJournal, transaction } from "@/lib/hos/producer/store";

// Delivery from the journal of the pilot's reference producer (FO-02 of FINISH-OBSERVE), at least once. A consumer
// reads the facts after its position, processes them, then acknowledges the last one it processed: a crash in between
// gives it the same facts again, which it deduplicates on source and id, as HOS Events requires. Each consumer has its
// own position, which only moves forward. The deliveries of a producer are written one after the other, so its
// positions are committed in increasing order and a consumer never skips a fact behind the last one it read.

// How the producer keeps its journal. The purge and the manifest both read retentionDays, so the manifest never
// promises more than the journal keeps.
export type ProducerConfig = { retentionDays: number };

// A consumer whose position is behind what retention purged: it missed facts, and must take the purged position as its
// own, knowingly, to read on.
export class JournalGap extends Error {
  constructor(
    readonly consumer: string,
    readonly position: number,
    readonly purgedThrough: number,
  ) {
    super(
      `Consumer ${consumer} is at position ${position}, but the journal is purged through ${purgedThrough}: the facts in between are gone. ` +
        `Rebuild its view from the producer, then acknowledge position ${purgedThrough} to read on.`,
    );
  }
}

// The facts a consumer has not acknowledged yet, at most limit of them, in the order they were written.
export async function readPending(db: Queryable, producer: ProducerKey, consumer: string, limit = 1000): Promise<JournalEntry[]> {
  const { rows } = await db.query<{ seq: string | null; purged_through: string }>(
    `SELECT cursors.seq, producers.purged_through
     FROM hos_producer.producers
     LEFT JOIN hos_producer.cursors ON cursors.tenant = producers.tenant AND cursors.source = producers.source AND cursors.consumer = $3
     WHERE producers.tenant = $1 AND producers.source = $2`,
    [producer.tenant, producer.source, consumer],
  );
  if (!rows.length) return [];
  const position = Number(rows[0].seq ?? 0);
  const purgedThrough = Number(rows[0].purged_through);
  if (position < purgedThrough) throw new JournalGap(consumer, position, purgedThrough);
  return readJournal(db, producer, { after: position, limit });
}

// Records that a consumer has processed every fact up to position seq. A position behind the consumer's leaves it
// where it is; a position the journal has not reached yet is refused, as it would skip facts not written yet.
export async function acknowledge(db: Queryable, { tenant, source }: ProducerKey, consumer: string, seq: number) {
  const { rows } = await db.query<{ reached: string | null }>(
    `SELECT GREATEST(purged_through, (SELECT max(seq) FROM hos_producer.journal WHERE tenant = $1 AND source = $2)) AS reached
     FROM hos_producer.producers WHERE tenant = $1 AND source = $2`,
    [tenant, source],
  );
  const reached = Number(rows[0]?.reached ?? 0);
  if (!Number.isSafeInteger(seq) || seq < 0 || seq > reached)
    throw new Error(`Position ${seq} is not in the journal of ${source} for ${tenant}, which has reached ${reached}.`);
  await db.query(
    `INSERT INTO hos_producer.cursors (tenant, source, consumer, seq) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant, source, consumer) DO UPDATE SET seq = GREATEST(cursors.seq, EXCLUDED.seq), updated_at = now()`,
    [tenant, source, consumer, seq],
  );
}

// The journal as JSON Lines, the replay format of HOS Events: one fact per line, in the order written, after a position
// or recorded since a time. purgedThrough says where the journal now starts.
export async function exportJournal(db: Queryable, producer: ProducerKey, options: { after?: number; since?: string } = {}) {
  const { rows } = await db.query<{ purged_through: string }>("SELECT purged_through FROM hos_producer.producers WHERE tenant = $1 AND source = $2", [
    producer.tenant,
    producer.source,
  ]);
  const entries = await readJournal(db, producer, options);
  return {
    jsonl: entries.map(({ line }) => `${line}\n`).join(""),
    facts: entries.length,
    last: entries.at(-1)?.seq ?? null,
    purgedThrough: Number(rows[0]?.purged_through ?? 0),
  };
}

// Deletes the facts recorded more than retentionDays before now, from the start of the journal only. It stops at the
// first fact still within retention, so it never deletes one, and the journal remains every fact after one position.
export async function purgeJournal(pool: Pool, producer: ProducerKey, { retentionDays }: ProducerConfig, now = new Date()) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1)
    throw new Error(`retentionDays must be a whole number of days, at least 1: ${retentionDays}.`);
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
  const { tenant, source } = producer;
  return transaction(pool, async (client) => {
    const { purgedThrough } = await lockProducer(client, producer);
    const { rows } = await client.query<{ seq: string }>(
      `DELETE FROM hos_producer.journal
       WHERE tenant = $1 AND source = $2
         AND seq < COALESCE((SELECT min(seq) FROM hos_producer.journal WHERE tenant = $1 AND source = $2 AND recorded_at >= $3), 9223372036854775807)
       RETURNING seq`,
      [tenant, source, cutoff],
    );
    const through = rows.reduce((last, { seq }) => Math.max(last, Number(seq)), purgedThrough);
    await client.query("UPDATE hos_producer.producers SET purged_through = $3 WHERE tenant = $1 AND source = $2", [tenant, source, through]);
    return { purged: rows.length, purgedThrough: through };
  });
}

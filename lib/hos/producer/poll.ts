import { setTimeout as sleep } from "node:timers/promises";

import type { IdentityRegistry } from "@hos-ai/sdk";
import type { Pool } from "pg";

import { type Delivered, type DeliveryResult, processDelivery, type ProducerKey, type Queryable } from "@/lib/hos/producer/store";

// Polling a source system for the pilot's reference producer (FO-02 of FINISH-OBSERVE), and the synchronisation status
// kept per property and per source. Each poll is one delivery: it reads the source and writes what the adapter made of
// it in one transaction. The status is written after that transaction, so a crash in between leaves the status older
// than the facts, never newer: it may call fresh facts stale, never stale facts fresh.

// One property of a producer, polled on its own.
export type PollTarget = ProducerKey & { propertyId: string };

// One poll: read the source as it is at now, and return what the adapter made of it.
export type Poll<State> = (context: { state: State | undefined; identities: IdentityRegistry; now: Date }) => Promise<Delivered<State>>;

export type PollOutcome = { ok: true; result: DeliveryResult } | { ok: false; error: string };

// The provisional values of FO-00, to validate with the participating operator: a poll every 2 minutes, and facts
// presented as possibly out of date once no poll has succeeded for 10 minutes.
export const pollingDefaults = { intervalMs: 2 * 60_000, staleAfterMs: 10 * 60_000 };

export type SyncStatus = {
  propertyId: string;
  startedAt: string | null;
  lastAttemptAt: string | null;
  // When the last successful poll began to read the source: its facts are as recent as that.
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  // The poller started after the last successful poll: it is catching up after a stop.
  resuming: boolean;
  // No poll has succeeded for longer than staleAfterMs, or ever: the facts may be out of date.
  stale: boolean;
};

const key = ({ tenant, source, propertyId }: PollTarget) => [tenant, source, propertyId];

async function ensureStatus(db: Queryable, target: PollTarget) {
  await db.query("INSERT INTO hos_producer.producers (tenant, source) VALUES ($1, $2) ON CONFLICT DO NOTHING", [target.tenant, target.source]);
  await db.query("INSERT INTO hos_producer.sync_status (tenant, source, property_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", key(target));
}

// Records that a poller has started for the target. Until its first successful poll, the target is resuming.
export async function markStarted(db: Queryable, target: PollTarget, now = new Date()) {
  await ensureStatus(db, target);
  await db.query("UPDATE hos_producer.sync_status SET started_at = $4 WHERE tenant = $1 AND source = $2 AND property_id = $3", [
    ...key(target),
    now.toISOString(),
  ]);
}

// Runs one poll as one delivery of the producer, then records its outcome. A failed poll writes no fact and leaves the
// last success as it was.
export async function pollOnce<State>(pool: Pool, target: PollTarget, poll: Poll<State>, now = new Date()): Promise<PollOutcome> {
  const at = now.toISOString();
  await ensureStatus(pool, target);
  await pool.query("UPDATE hos_producer.sync_status SET last_attempt_at = $4 WHERE tenant = $1 AND source = $2 AND property_id = $3", [
    ...key(target),
    at,
  ]);
  try {
    const result = await processDelivery<State>(pool, target, (context) => poll({ ...context, now }));
    await pool.query(
      "UPDATE hos_producer.sync_status SET last_success_at = $4, consecutive_failures = 0 WHERE tenant = $1 AND source = $2 AND property_id = $3",
      [...key(target), at],
    );
    return { ok: true, result };
  } catch (failure) {
    const error = failure instanceof Error ? failure.message : String(failure);
    await pool.query(
      `UPDATE hos_producer.sync_status SET last_error = $4, last_error_at = $5, consecutive_failures = consecutive_failures + 1
       WHERE tenant = $1 AND source = $2 AND property_id = $3`,
      [...key(target), error, at],
    );
    return { ok: false, error };
  }
}

// Polls the target every intervalMs until signal aborts. A failed poll is recorded and the next one tries again; a poll
// that takes longer than the interval is followed at once by the next.
export async function pollEvery<State>(
  pool: Pool,
  target: PollTarget,
  poll: Poll<State>,
  {
    intervalMs = pollingDefaults.intervalMs,
    signal,
    onPoll,
  }: { intervalMs?: number; signal?: AbortSignal; onPoll?: (outcome: PollOutcome, at: Date) => void } = {},
) {
  await markStarted(pool, target);
  while (!signal?.aborted) {
    const started = new Date();
    onPoll?.(await pollOnce(pool, target, poll, started), started);
    const rest = started.getTime() + intervalMs - Date.now();
    if (rest > 0 && !signal?.aborted) await sleep(rest, undefined, { signal }).catch(() => undefined);
  }
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

// The status of every property of a producer that has been polled.
export async function readSyncStatuses(
  db: Queryable,
  { tenant, source }: ProducerKey,
  { staleAfterMs = pollingDefaults.staleAfterMs, now = new Date() } = {},
): Promise<SyncStatus[]> {
  const { rows } = await db.query<{
    property_id: string;
    started_at: Date | null;
    last_attempt_at: Date | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_error_at: Date | null;
    consecutive_failures: number;
  }>("SELECT * FROM hos_producer.sync_status WHERE tenant = $1 AND source = $2 ORDER BY property_id", [tenant, source]);
  return rows.map((row) => ({
    propertyId: row.property_id,
    startedAt: iso(row.started_at),
    lastAttemptAt: iso(row.last_attempt_at),
    lastSuccessAt: iso(row.last_success_at),
    lastError: row.last_error,
    lastErrorAt: iso(row.last_error_at),
    consecutiveFailures: row.consecutive_failures,
    resuming: Boolean(row.started_at) && (!row.last_success_at || row.last_success_at < row.started_at!),
    stale: !row.last_success_at || now.getTime() - row.last_success_at.getTime() > staleAfterMs,
  }));
}

// The status of one property; a property never polled has no success, so its facts are stale.
export async function readSyncStatus(db: Queryable, target: PollTarget, options: { staleAfterMs?: number; now?: Date } = {}): Promise<SyncStatus> {
  const found = (await readSyncStatuses(db, target, options)).find((status) => status.propertyId === target.propertyId);
  return (
    found ?? {
      propertyId: target.propertyId,
      startedAt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      resuming: false,
      stale: true,
    }
  );
}

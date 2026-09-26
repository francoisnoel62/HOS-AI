import type { Pool } from "pg";

// Keeps the privacy notice true: submissions past their retention date and expired rate-limit keys are deleted.
// A submission's events cascade with it.
export async function purgeExpiredRecords(db: Pick<Pool, "query">, now = new Date()) {
  const submissions = await db.query("DELETE FROM submissions WHERE retention_due_at <= $1", [now]);
  const abuseKeys = await db.query("DELETE FROM abuse_keys WHERE expires_at <= $1", [now]);
  return { submissions: submissions.rowCount ?? 0, abuseKeys: abuseKeys.rowCount ?? 0 };
}

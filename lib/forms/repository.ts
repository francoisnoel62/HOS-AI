import { randomUUID } from "node:crypto";

import { encryptValue } from "@/lib/forms/crypto";
import { getDb } from "@/lib/forms/db";
import { retentionDueAt } from "@/lib/forms/schema";
import type { SubmissionKind } from "@/lib/forms/types";
import { privacyVersion } from "@/lib/legal";

export async function createSubmission({ kind, payload, email, country }: { kind: SubmissionKind; payload: unknown; email: string; country?: string }) {
  const db = getDb();
  const id = randomUUID();
  const now = new Date();
  const retentionDue = retentionDueAt(now);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO submissions (id, kind, status, payload, contact_email, country, privacy_version, created_at, updated_at, last_contact_at, retention_due_at)
       VALUES ($1, $2, 'received', $3, $4, $5, $6, $7, $7, $7, $8)`,
      [id, kind, encryptValue(payload), encryptValue(email), country || null, privacyVersion, now, retentionDue],
    );
    await client.query(
      "INSERT INTO submission_events (id, submission_id, event_type, actor, created_at, detail) VALUES ($1, $2, 'created', 'public-form', $3, $4)",
      [randomUUID(), id, now, JSON.stringify({ kind })],
    );
    await client.query("COMMIT");
    return { id, createdAt: now };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

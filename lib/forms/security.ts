import { createHash } from "node:crypto";

import { getDb } from "@/lib/forms/db";

export function assertSafeRequest(request: Request) {
  if (request.method !== "POST") throw new Error("Method not allowed.");
  const expectedOrigin = process.env.FORM_ORIGIN;
  const origin = request.headers.get("origin");
  if (expectedOrigin && origin && origin !== expectedOrigin) throw new Error("Invalid request origin.");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 20_000) throw new Error("Request payload is too large.");
}

function fingerprint(request: Request) {
  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const userAgent = request.headers.get("user-agent") ?? "";
  const salt = process.env.RATE_LIMIT_SALT ?? "local-development-only-not-for-production";
  return createHash("sha256").update(`${salt}:${rawIp}:${userAgent}`).digest("hex");
}

export async function enforceRateLimit(request: Request) {
  const db = getDb();
  const hash = fingerprint(request);
  const limit = Number(process.env.FORM_RATE_LIMIT ?? 5);
  const windowSeconds = Number(process.env.FORM_RATE_LIMIT_WINDOW_SECONDS ?? 3_600);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  const existing = await db.query<{ count: number; expires_at: Date }>(
    "SELECT count, expires_at FROM abuse_keys WHERE hash = $1 AND purpose = 'rate_limit' FOR UPDATE",
    [hash],
  );

  if (existing.rowCount && existing.rows[0].expires_at > now) {
    if (existing.rows[0].count >= limit) throw new Error("Too many submissions. Please try again later.");
    await db.query("UPDATE abuse_keys SET count = count + 1 WHERE hash = $1 AND purpose = 'rate_limit'", [hash]);
    return;
  }

  await db.query(
    `INSERT INTO abuse_keys (hash, purpose, count, expires_at)
     VALUES ($1, 'rate_limit', 1, $2)
     ON CONFLICT (hash, purpose) DO UPDATE SET count = 1, expires_at = EXCLUDED.expires_at`,
    [hash, expiresAt],
  );
}

export function assertHoneypot(value: string) {
  if (value) throw new Error("Unable to submit this form.");
}

import { NextResponse } from "next/server";

import { getDb } from "@/lib/forms/db";
import { purgeExpiredRecords } from "@/lib/forms/retention";

// Called daily by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ skipped: "No database is configured." }, { status: 503 });
  const purged = await purgeExpiredRecords(getDb());
  console.info("Retention purge completed", purged);
  return NextResponse.json(purged);
}

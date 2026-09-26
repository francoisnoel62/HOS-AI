import { localDate } from "@hos-ai/sdk";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import type { CloudbedsReservation, CloudbedsRoomBlock, CloudbedsRoomStatus } from "../lib/hos/mappings/cloudbeds";
import { type CloudbedsSnapshot, syncCloudbeds } from "../lib/hos/mappings/cloudbeds-sync";
import { runLiveCheck, writeLiveReport } from "./live-report";

// Runs the experimental Cloudbeds mapping against a live Cloudbeds property, read-only: it calls get operations only and
// never writes to Cloudbeds. The API key comes from the environment and is never printed. A partner sandbox, which
// Cloudbeds grants on request, or a property's own API key (Account, Apps & Marketplace, API Credentials) gives one.
//
//   CLOUDBEDS_API_KEY=… npm run cloudbeds:live -- --days 1 --out cloudbeds-live.json
//
// It writes the facts, a restarted adapter's redelivery and the manifest to --record, data/live-checks/cloudbeds by
// default, and runs the producer check on them.
//
// --property, or CLOUDBEDS_PROPERTY_ID, picks the property when the key reaches several. --check-in and --check-out
// override the standard times getHotelDetails reports. CLOUDBEDS_API_ADDRESS defaults to Cloudbeds's API v1.3. Behind
// an HTTP proxy, Node needs NODE_USE_ENV_PROXY=1 to route fetch through it.

const { values: args } = parseArgs({
  options: {
    days: { type: "string", default: "1" },
    property: { type: "string" },
    "check-in": { type: "string" },
    "check-out": { type: "string" },
    out: { type: "string" },
    events: { type: "boolean", default: false },
    record: { type: "string", default: "data/live-checks/cloudbeds" },
  },
});

const api = process.env.CLOUDBEDS_API_ADDRESS ?? "https://api.cloudbeds.com/api/v1.3";
const apiKey = process.env.CLOUDBEDS_API_KEY;
// getReservations pages hold at most 100 reservations; 20 pages is more than a live check needs.
const pageSize = 100;
const maxPages = 20;
// Every reservation is fetched on its own, as a webhook would have it fetched: a pause between calls keeps the check
// under Cloudbeds's rate limit, and a 429 waits and retries.
const pause = 250;
const retries = 3;

type Envelope = { success?: boolean; message?: string; data?: unknown; count?: number; total?: number };

let last = 0;
async function get<T extends Envelope>(operation: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${api}/${operation}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  for (let attempt = 0; ; attempt++) {
    await sleep(Math.max(0, last + pause - Date.now()));
    last = Date.now();
    const response = await fetch(url, { headers: { "x-api-key": apiKey!, Accept: "application/json" } });
    if (response.status === 429 && attempt < retries) {
      await sleep(1000 * (Number(response.headers.get("retry-after")) || 2 ** attempt));
      continue;
    }
    const text = await response.text();
    let body: T | undefined;
    try {
      body = JSON.parse(text) as T;
    } catch {}
    // Cloudbeds may answer 200 with success false.
    if (!response.ok || !body || body.success === false)
      throw new Error(`${operation} answered ${response.status}: ${(body?.message ?? text).slice(0, 300)}`);
    return body;
  }
}

async function list<T>(
  operation: string,
  query: Record<string, string>,
  size: number,
  items: (body: Envelope) => T[] = (body) => (body.data as T[] | undefined) ?? [],
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await get(operation, { ...query, pageNumber: String(page), pageSize: String(size) });
    const batch = items(body);
    all.push(...batch);
    if (!batch.length || (body.total === undefined ? batch.length < size : all.length >= body.total)) return all;
  }
  console.warn(`${operation}: stopped after ${maxPages} pages.`);
  return all;
}

// Cloudbeds reports standard times as 15:00 or 3:00 PM; the adapter takes 24-hour HH:MM.
function clock(value: string | undefined, name: string) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!match) throw new Error(`Cannot read the ${name} time ${JSON.stringify(value)}; pass --${name} HH:MM.`);
  let hours = Number(match[1]) % (match[3] ? 12 : 24);
  if (match[3]?.toLowerCase().startsWith("p")) hours += 12;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

async function main() {
  if (!apiKey) {
    console.error("Set CLOUDBEDS_API_KEY: a partner sandbox's key, or a property's own under Account, Apps & Marketplace, API Credentials.");
    process.exit(2);
  }
  const days = Number(args.days);
  // getRoomBlocks takes a window of at most 35 days.
  if (!Number.isInteger(days) || days < 0 || days > 30) throw new Error("--days must be an integer from 0 to 30.");

  const fetchedAt = new Date().toISOString();
  type CloudbedsHotel = { propertyID: string; propertyName: string; propertyTimezone: string };
  const hotels = await list<CloudbedsHotel>("getHotels", {}, 20);
  const wanted = args.property ?? process.env.CLOUDBEDS_PROPERTY_ID;
  const hotel = wanted ? hotels.find((candidate) => String(candidate.propertyID) === wanted) : hotels.length === 1 ? hotels[0] : undefined;
  if (!hotel) {
    console.error(`${wanted ? `No property ${wanted}.` : "The key reaches several properties."} Pick one with --property:`);
    for (const candidate of hotels) console.error(`  ${String(candidate.propertyID).padEnd(10)} ${candidate.propertyName}`);
    process.exit(2);
  }
  const propertyID = String(hotel.propertyID);
  const timezone = hotel.propertyTimezone;
  const details = await get<Envelope & { data: { propertyPolicy?: { propertyCheckInTime?: string; propertyCheckOutTime?: string } } }>(
    "getHotelDetails",
    { propertyID },
  );
  const policy = details.data.propertyPolicy;
  const checkInTime = clock(args["check-in"] ?? policy?.propertyCheckInTime, "check-in");
  const checkOutTime = clock(args["check-out"] ?? policy?.propertyCheckOutTime, "check-out");

  // Yesterday to the end of the window, in property days, so stays in house today and their rooms are included.
  const start = localDate(new Date(Date.parse(fetchedAt) - 24 * 3600 * 1000).toISOString(), timezone);
  const end = localDate(new Date(Date.parse(fetchedAt) + days * 24 * 3600 * 1000).toISOString(), timezone);
  // Reservations that arrive by the end of the window and leave after its start.
  const found = await list<{ reservationID: string }>("getReservations", { propertyID, checkInTo: end, checkOutFrom: start }, pageSize);
  const ids = [...new Set(found.map((reservation) => String(reservation.reservationID)))];
  if (ids.length > 20) console.warn(`Fetching ${ids.length} reservations one by one…`);
  const reservations: CloudbedsReservation[] = [];
  for (const reservationID of ids)
    reservations.push((await get<Envelope & { data: CloudbedsReservation }>("getReservation", { propertyID, reservationID })).data);
  const rooms = await list<CloudbedsRoomStatus>("getHousekeepingStatus", { propertyID }, 5000);
  const roomBlocks = await list<CloudbedsRoomBlock>(
    "getRoomBlocks",
    { propertyID, startDate: start, endDate: end },
    100,
    (body) => (body.data as { roomBlocks?: CloudbedsRoomBlock[] } | undefined)?.roomBlocks ?? [],
  );

  const snapshot: CloudbedsSnapshot = {
    fetchedAt,
    property: { id: propertyID, timezone, checkInTime, checkOutTime },
    reservations,
    rooms,
    roomBlocks,
  };
  const report = syncCloudbeds(snapshot, {
    source: "urn:hos:pms:cloudbeds-live",
    tenant: "tenant_cloudbeds_live",
    propertyId: "prop_cloudbeds_live",
  });

  // Each block's dates next to the window read from them, in property time, to confirm how endDate reads.
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const at = (instant: string | null) => (instant ? local.format(new Date(instant)).replace(",", "") : "none");
  const blocks = report.room_blocks.flatMap((block) =>
    block.rooms.map(
      (room) =>
        `  ${block.type} ${block.start_date} to ${block.end_date}, room ${room.room ?? "?"}: window ${at(room.starts_at)} to ${at(room.ends_at)}`,
    ),
  );
  await writeLiveReport(report, {
    heading: `Cloudbeds ${api} — ${hotel.propertyName} (${propertyID}, ${timezone})`,
    notes: [
      `Check-in ${checkInTime}, check-out ${checkOutTime}. Room blocks from ${start} to ${end}, with the window read in property time:`,
      ...(blocks.length ? blocks : ["  none"]),
    ],
    context: {
      api,
      fetched_at: fetchedAt,
      window: { check_in_to: end, check_out_from: start },
      property: { id: propertyID, name: hotel.propertyName, timezone, check_in_time: checkInTime, check_out_time: checkOutTime },
      room_blocks: report.room_blocks,
    },
    out: args.out,
    events: args.events,
    record: args.record,
  });
}

runLiveCheck(main);

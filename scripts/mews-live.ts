import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import type { MewsReservation, MewsResource, MewsResourceBlock } from "../lib/hos/mappings/mews";
import { type MewsSnapshot, syncMews } from "../lib/hos/mappings/mews-sync";

// Runs the experimental Mews mapping against a live Mews Connector API environment, read-only: it calls Get operations
// only and never writes to Mews. Tokens come from the environment and are never printed. Mews publishes demo tokens in
// its Connector API documentation (Getting started, Environments); a real enterprise needs its own.
//
//   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run mews:live -- --days 1 --out mews-live.json
//
// MEWS_PLATFORM_ADDRESS defaults to https://api.mews-demo.com. MEWS_SERVICE_IDS, comma-separated, overrides the
// accommodation services. Behind an HTTP proxy, Node needs NODE_USE_ENV_PROXY=1 to route fetch through it.

const { values: args } = parseArgs({ options: { days: { type: "string", default: "1" }, out: { type: "string" }, events: { type: "boolean", default: false } } });

const platform = process.env.MEWS_PLATFORM_ADDRESS ?? "https://api.mews-demo.com";
const clientToken = process.env.MEWS_CLIENT_TOKEN;
const accessToken = process.env.MEWS_ACCESS_TOKEN;
const client = "HOS AI mapping check 0.1";
// Mews allows 1,000 items a page; ten pages is more than a live check needs.
const pageSize = 1000;
const maxPages = 10;

type Page = { Cursor?: string | null };

async function call<T>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${platform}/api/connector/v1/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ClientToken: clientToken, AccessToken: accessToken, Client: client, ...body }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${operation} answered ${response.status}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

async function getAll<T>(operation: string, key: string, body: Record<string, unknown>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < maxPages; page++) {
    const response = await call<Page & Record<string, T[]>>(operation, { ...body, Limitation: { Count: pageSize, ...(cursor ? { Cursor: cursor } : {}) } });
    const batch = response[key] ?? [];
    items.push(...batch);
    cursor = response.Cursor;
    if (!cursor || batch.length < pageSize) return items;
  }
  console.warn(`${operation}: stopped after ${maxPages} pages.`);
  return items;
}

type MewsService = { Id: string; IsActive: boolean; Names?: Record<string, string>; Name?: string; Data: { Discriminator: string; Value?: { TimeUnitPeriod?: string } } };

async function main() {
  if (!clientToken || !accessToken) {
    console.error("Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN. The Mews Connector API documentation publishes demo tokens under Getting started, Environments.");
    process.exit(2);
  }
  const days = Number(args.days);
  if (!Number.isInteger(days) || days < 0 || days > 60) throw new Error("--days must be an integer from 0 to 60.");

  const fetchedAt = new Date().toISOString();
  const configuration = await call<{ Enterprise: { Id: string; Name?: string; TimeZoneIdentifier: string } }>("configuration/get");
  const enterprise = { id: configuration.Enterprise.Id, timezone: configuration.Enterprise.TimeZoneIdentifier };
  const scope = { EnterpriseIds: [enterprise.id] };

  const services = await getAll<MewsService>("services/getAll", "Services", scope);
  const bookable = services.filter((service) => service.IsActive && service.Data.Discriminator === "Bookable");
  // Nightly bookable services are stays; hourly ones are meeting rooms, parking and the like. MEWS_SERVICE_IDS overrides.
  const override = process.env.MEWS_SERVICE_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const accommodation = override ?? bookable.filter((service) => (service.Data.Value?.TimeUnitPeriod ?? "Day") === "Day").map((service) => service.Id);
  if (!accommodation.length) throw new Error("No accommodation service found; set MEWS_SERVICE_IDS.");

  // Yesterday to the end of the window, so stays in house today and their rooms are included.
  const start = new Date(Date.parse(fetchedAt) - 24 * 3600 * 1000).toISOString();
  const end = new Date(Date.parse(fetchedAt) + (days + 1) * 24 * 3600 * 1000).toISOString();
  const colliding = { StartUtc: start, EndUtc: end };
  const [reservations, resources, resourceBlocks] = await Promise.all([
    getAll<MewsReservation>("reservations/getAll/2023-06-06", "Reservations", { ...scope, ServiceIds: accommodation, CollidingUtc: colliding }),
    getAll<MewsResource>("resources/getAll", "Resources", { ...scope, Extent: { Resources: true, Inactive: false } }),
    getAll<MewsResourceBlock>("resourceBlocks/getAll", "ResourceBlocks", { ...scope, CollidingUtc: colliding, ActivityStates: ["Active"] }),
  ]);

  const snapshot: MewsSnapshot = { fetchedAt, enterprise, accommodationServiceIds: accommodation, reservations, resources, resourceBlocks };
  const report = syncMews(snapshot, { source: "urn:hos:pms:mews-live", tenant: "tenant_mews_live", propertyId: "prop_mews_live" });

  const serviceName = (service: MewsService) => service.Names?.["en-US"] ?? service.Names?.["en-GB"] ?? Object.values(service.Names ?? {})[0] ?? service.Name ?? service.Id;
  const summary = {
    platform,
    fetched_at: fetchedAt,
    window: colliding,
    enterprise: { name: configuration.Enterprise.Name ?? null, timezone: enterprise.timezone },
    accommodation_services: accommodation.map((id) => {
      const service = services.find((candidate) => candidate.Id === id);
      return service ? serviceName(service) : id;
    }),
    other_bookable_services: bookable.filter((service) => !accommodation.includes(service.Id)).map(serviceName),
    fetched: report.fetched,
    hos_events: report.events.length,
    events_by_type: report.events_by_type,
    schema_errors: report.schema_errors,
    failures: report.failures,
    resync_events: report.resync_events,
    unmapped: report.unmapped,
    dispositions: report.dispositions,
    situations: report.situations,
    arrivals: report.arrivals,
  };

  const arrivals = report.arrivals.stays;
  const count = (predicate: (stay: (typeof arrivals)[number]) => boolean) => arrivals.filter(predicate).length;
  console.log(`Mews ${platform} — ${summary.enterprise.name ?? enterprise.id} (${enterprise.timezone})`);
  console.log(`Fetched ${report.fetched.reservations} reservations, ${report.fetched.resources} resources, ${report.fetched.resource_blocks} resource blocks.`);
  console.log(`Accommodation services: ${summary.accommodation_services.join(", ")}`);
  console.log(`HOS facts: ${report.events.length}, schema errors: ${report.schema_errors.length}, failures: ${report.failures.length}, facts on a second pass: ${report.resync_events}`);
  for (const [type, total] of Object.entries(report.events_by_type).sort()) console.log(`  ${type.padEnd(28)} ${total}`);
  console.log("Not mapped:");
  for (const { event, reason, count: total } of report.unmapped) console.log(`  ${String(total).padStart(5)}  ${event}: ${reason}`);
  console.log(`Dispositions: ${JSON.stringify(report.dispositions)}; situations: ${JSON.stringify(report.situations)}`);
  console.log(
    `Arrivals on ${report.arrivals.business_date}: ${arrivals.length} — ready ${count((stay) => stay.readiness === "ready")}, not ready ${count((stay) => stay.readiness === "not_ready")}, unknown ${count((stay) => stay.readiness === "unknown")}, blocked by maintenance ${count((stay) => Boolean(stay.maintenance))}, at risk ${count((stay) => stay.situation === "at_risk")}`,
  );
  if (args.out) {
    await writeFile(args.out, `${JSON.stringify(args.events ? { ...summary, events: report.events } : summary, null, 2)}\n`);
    console.log(`Report written to ${args.out}.`);
  }
  if (report.schema_errors.length || report.failures.length || report.resync_events) process.exitCode = 1;
}

main().catch((error: unknown) => {
  // fetch reports network failures, such as a refused proxy tunnel, in its cause.
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  console.error(error instanceof Error ? `${error.message}${cause}` : error);
  process.exit(1);
});

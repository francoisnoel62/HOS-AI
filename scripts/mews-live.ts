import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import type { MewsReservation, MewsResource, MewsResourceBlock } from "../lib/hos/mappings/mews";
import { accommodationServices, type MewsResourceCategory, type MewsService, type MewsSnapshot, syncMews } from "../lib/hos/mappings/mews-sync";
import { runLiveCheck, writeLiveReport } from "./live-report";

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
// Mews allows 200 requests per access token in 30 seconds, and everyone who tries the public demo tokens shares them: a
// 429 waits for Retry-After, or backs off, and retries.
const retries = 5;

type Page = { Cursor?: string | null };

async function call<T>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${platform}/api/connector/v1/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ClientToken: clientToken, AccessToken: accessToken, Client: client, ...body }),
    });
    if (response.status === 429 && attempt < retries) {
      await response.body?.cancel();
      await sleep(1000 * (Number(response.headers.get("retry-after")) || 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${operation} answered ${response.status}: ${detail.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
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
  // Bookable services with rooms, beds, apartments or pitches are stays; the others are parking, meeting rooms and the
  // like. MEWS_SERVICE_IDS overrides.
  const override = process.env.MEWS_SERVICE_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const categories =
    override || !bookable.length
      ? []
      : await getAll<MewsResourceCategory>("resourceCategories/getAll", "ResourceCategories", { ...scope, ServiceIds: bookable.map((service) => service.Id), ActivityStates: ["Active"] });
  const accommodation = override ?? accommodationServices(bookable, categories);
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
  const accommodationNames = accommodation.map((id) => {
    const service = services.find((candidate) => candidate.Id === id);
    return service ? serviceName(service) : id;
  });
  await writeLiveReport(report, {
    heading: `Mews ${platform} — ${configuration.Enterprise.Name ?? enterprise.id} (${enterprise.timezone})`,
    notes: [`Accommodation services: ${accommodationNames.join(", ")}`],
    context: {
      platform,
      fetched_at: fetchedAt,
      window: colliding,
      enterprise: { name: configuration.Enterprise.Name ?? null, timezone: enterprise.timezone },
      accommodation_services: accommodationNames,
      other_bookable_services: bookable.filter((service) => !accommodation.includes(service.Id)).map(serviceName),
    },
    out: args.out,
    events: args.events,
  });
}

runLiveCheck(main);

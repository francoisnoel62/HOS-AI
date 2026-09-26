import { parseArgs } from "node:util";

import type { ApaleoMaintenance, ApaleoReservation, ApaleoUnit } from "../lib/hos/mappings/apaleo";
import { type ApaleoSnapshot, syncApaleo } from "../lib/hos/mappings/apaleo-sync";
import { runLiveCheck, writeLiveReport } from "./live-report";

// Runs the experimental Apaleo mapping against a live Apaleo account, read-only: it calls GET operations only and never
// writes to Apaleo. The credentials are those of a simple client (custom app) registered in the account, under Apps,
// Connected apps; they come from the environment and are never printed. A free developer account comes with sample
// hotels to run it against.
//
//   APALEO_CLIENT_ID=… APALEO_CLIENT_SECRET=… npm run apaleo:live -- --property MUC --days 1 --out apaleo-live.json
//
// --property, or APALEO_PROPERTY_ID, picks the property when the account has several. --inspections says the property
// inspects rooms, so that Clean means inspected. APALEO_IDENTITY_ADDRESS and APALEO_API_ADDRESS default to Apaleo's
// production hosts. Behind an HTTP proxy, Node needs NODE_USE_ENV_PROXY=1 to route fetch through it.

const { values: args } = parseArgs({
  options: { days: { type: "string", default: "1" }, property: { type: "string" }, inspections: { type: "boolean", default: false }, out: { type: "string" }, events: { type: "boolean", default: false } },
});

const identity = process.env.APALEO_IDENTITY_ADDRESS ?? "https://identity.apaleo.com";
const api = process.env.APALEO_API_ADDRESS ?? "https://api.apaleo.com";
const clientId = process.env.APALEO_CLIENT_ID;
const clientSecret = process.env.APALEO_CLIENT_SECRET;
// A page of 200 and 25 pages is more than a live check needs.
const pageSize = 200;
const maxPages = 25;

// Apaleo takes times without fractional seconds.
const apaleoTime = (instant: number) => new Date(instant).toISOString().replace(/\.\d{3}Z$/, "Z");

async function token() {
  // The client credentials grant, as Apaleo's own n8n node requests it.
  const response = await fetch(`${identity}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new Error(`The token request answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function main() {
  if (!clientId || !clientSecret) {
    console.error("Set APALEO_CLIENT_ID and APALEO_CLIENT_SECRET: register a simple client (custom app) under Apps, Connected apps, in your Apaleo account.");
    process.exit(2);
  }
  const days = Number(args.days);
  if (!Number.isInteger(days) || days < 0 || days > 60) throw new Error("--days must be an integer from 0 to 60.");

  const accessToken = await token();
  async function get<T>(path: string, query: Record<string, string>): Promise<T | null> {
    const url = new URL(path, api);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    // Apaleo answers a page with no items with 204 No Content.
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}${response.status === 403 ? " (is a read scope missing from the app?)" : ""}: ${(await response.text()).slice(0, 300)}`);
    return (await response.json()) as T;
  }
  async function list<T>(path: string, key: string, query: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const response = await get<{ count?: number } & Record<string, T[]>>(path, { ...query, pageNumber: String(page), pageSize: String(pageSize) });
      const batch = response?.[key] ?? [];
      items.push(...batch);
      const total = response?.count;
      if (!batch.length || (total === undefined ? batch.length < pageSize : items.length >= total)) return items;
    }
    console.warn(`${path}: stopped after ${maxPages} pages.`);
    return items;
  }

  const fetchedAt = new Date().toISOString();
  type ApaleoProperty = { id: string; code: string; name: string; timeZone: string; status: string };
  const properties = await list<ApaleoProperty>("/inventory/v1/properties", "properties", {});
  const wanted = args.property ?? process.env.APALEO_PROPERTY_ID;
  const property = wanted ? properties.find((candidate) => candidate.id === wanted || candidate.code === wanted) : properties.length === 1 ? properties[0] : undefined;
  if (!property) {
    console.error(`${wanted ? `No property ${wanted}.` : "The account has several properties."} Pick one with --property:`);
    for (const candidate of properties) console.error(`  ${candidate.id.padEnd(12)} ${candidate.name} (${candidate.status})`);
    process.exit(2);
  }
  const scope = { propertyId: property.id };

  // Yesterday to the end of the window, so stays in house today and their rooms are included.
  const start = apaleoTime(Date.parse(fetchedAt) - 24 * 3600 * 1000);
  const end = apaleoTime(Date.parse(fetchedAt) + (days + 1) * 24 * 3600 * 1000);
  type ApaleoUnitGroup = { id: string; name: string; type: string };
  const [unitGroups, units, maintenances, reservations] = await Promise.all([
    list<ApaleoUnitGroup>("/inventory/v1/unit-groups", "unitGroups", scope),
    list<ApaleoUnit>("/inventory/v1/units", "units", scope),
    // Windows that end after the start and begin before the end.
    list<ApaleoMaintenance>("/operations/v1/maintenances", "maintenances", { ...scope, from: start, to: end }),
    // Stay returns every reservation that overlaps the window.
    list<ApaleoReservation>("/booking/v1/reservations", "reservations", { propertyIds: property.id, unitGroupTypes: "BedRoom", dateFilter: "Stay", from: start, to: end }),
  ]);

  const snapshot: ApaleoSnapshot = {
    fetchedAt,
    property: { id: property.id, timezone: property.timeZone, inspections: args.inspections },
    unitGroups,
    reservations,
    units,
    maintenances,
  };
  const report = syncApaleo(snapshot, { source: "urn:hos:pms:apaleo-live", tenant: "tenant_apaleo_live", propertyId: "prop_apaleo_live" });

  const bedrooms = unitGroups.filter((group) => group.type === "BedRoom").map((group) => group.name);
  await writeLiveReport(report, {
    heading: `Apaleo ${api} — ${property.name} (${property.id}, ${property.status}, ${property.timeZone})`,
    notes: [`Bedroom unit groups: ${bedrooms.join(", ") || "none"}; inspections: ${args.inspections ? "yes" : "no (pass --inspections if the property inspects)"}`],
    context: {
      api,
      fetched_at: fetchedAt,
      window: { from: start, to: end },
      property: { id: property.id, name: property.name, status: property.status, timezone: property.timeZone, inspections: args.inspections },
      bedroom_unit_groups: bedrooms,
      other_unit_groups: unitGroups.filter((group) => group.type !== "BedRoom").map((group) => `${group.name} (${group.type})`),
    },
    out: args.out,
    events: args.events,
  });
}

runLiveCheck(main);

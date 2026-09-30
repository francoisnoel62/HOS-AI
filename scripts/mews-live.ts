import { parseArgs } from "node:util";

import type { MewsReservation, MewsResource, MewsResourceBlock } from "../lib/hos/mappings/mews";
import { createMewsClient, fetchMewsEnterprise } from "../lib/hos/mappings/mews-client";
import { type MewsService, type MewsSnapshot, syncMews } from "../lib/hos/mappings/mews-sync";
import { runLiveCheck, writeLiveReport } from "./live-report";

// Runs the experimental Mews mapping against a live Mews Connector API environment, read-only: it calls Get operations
// only and never writes to Mews. Tokens come from the environment and are never printed. Mews publishes demo tokens in
// its Connector API documentation (Getting started, Environments); a real enterprise needs its own.
//
//   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run mews:live -- --days 1 --out mews-live.json
//
// It writes the facts, a restarted adapter's redelivery and the manifest to --record, data/live-checks/mews by default,
// and runs the producer check on them.
//
// MEWS_PLATFORM_ADDRESS defaults to https://api.mews-demo.com. MEWS_SERVICE_IDS, comma-separated, overrides the
// accommodation services. Behind an HTTP proxy, Node needs NODE_USE_ENV_PROXY=1 to route fetch through it.

const { values: args } = parseArgs({
  options: {
    days: { type: "string", default: "1" },
    out: { type: "string" },
    events: { type: "boolean", default: false },
    record: { type: "string", default: "data/live-checks/mews" },
  },
});

const platform = process.env.MEWS_PLATFORM_ADDRESS ?? "https://api.mews-demo.com";
const clientToken = process.env.MEWS_CLIENT_TOKEN;
const accessToken = process.env.MEWS_ACCESS_TOKEN;

async function main() {
  if (!clientToken || !accessToken) {
    console.error(
      "Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN. The Mews Connector API documentation publishes demo tokens under Getting started, Environments.",
    );
    process.exit(2);
  }
  const days = Number(args.days);
  if (!Number.isInteger(days) || days < 0 || days > 60) throw new Error("--days must be an integer from 0 to 60.");

  const fetchedAt = new Date().toISOString();
  const mews = createMewsClient({ platform, clientToken, accessToken, client: "HOS AI mapping check 0.1" });
  const override = process.env.MEWS_SERVICE_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const { enterprise, services, bookable, accommodation } = await fetchMewsEnterprise(mews, override);
  const scope = { EnterpriseIds: [enterprise.id] };

  // Yesterday to the end of the window, so stays in house today and their rooms are included.
  const start = new Date(Date.parse(fetchedAt) - 24 * 3600 * 1000).toISOString();
  const end = new Date(Date.parse(fetchedAt) + (days + 1) * 24 * 3600 * 1000).toISOString();
  const colliding = { StartUtc: start, EndUtc: end };
  const [reservations, resources, resourceBlocks] = await Promise.all([
    mews.getAll<MewsReservation>("reservations/getAll/2023-06-06", "Reservations", { ...scope, ServiceIds: accommodation, CollidingUtc: colliding }),
    mews.getAll<MewsResource>("resources/getAll", "Resources", { ...scope, Extent: { Resources: true, Inactive: false } }),
    mews.getAll<MewsResourceBlock>("resourceBlocks/getAll", "ResourceBlocks", { ...scope, CollidingUtc: colliding, ActivityStates: ["Active"] }),
  ]);

  const snapshot: MewsSnapshot = { fetchedAt, enterprise, accommodationServiceIds: accommodation, reservations, resources, resourceBlocks };
  const report = syncMews(snapshot, { source: "urn:hos:pms:mews-live", tenant: "tenant_mews_live", propertyId: "prop_mews_live" });

  const serviceName = (service: MewsService) =>
    service.Names?.["en-US"] ?? service.Names?.["en-GB"] ?? Object.values(service.Names ?? {})[0] ?? service.Name ?? service.Id;
  const accommodationNames = accommodation.map((id) => {
    const service = services.find((candidate) => candidate.Id === id);
    return service ? serviceName(service) : id;
  });
  await writeLiveReport(report, {
    heading: `Mews ${platform} — ${enterprise.name ?? enterprise.id} (${enterprise.timezone})`,
    notes: [`Accommodation services: ${accommodationNames.join(", ")}`],
    context: {
      platform,
      fetched_at: fetchedAt,
      window: colliding,
      enterprise: { name: enterprise.name, timezone: enterprise.timezone },
      accommodation_services: accommodationNames,
      other_bookable_services: bookable.filter((service) => !accommodation.includes(service.Id)).map(serviceName),
    },
    out: args.out,
    events: args.events,
    record: args.record,
  });
}

runLiveCheck(main);

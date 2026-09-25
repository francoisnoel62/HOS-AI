import { createIdentityRegistry, localDate, type Unmapped } from "@/lib/hos/mappings/common";
import { createMewsAdapter, type MewsReservation, type MewsResource, type MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { type Disposition, type Readiness, replayArrivalReadiness, type SituationStatus } from "@/lib/hos/projection";
import type { HosFact, ProducerManifest } from "@/lib/hos/types";
import { validateEvent, validateManifest } from "@/lib/hos/validation";

// A first synchronisation of the experimental Mews mapping with a live Mews enterprise, as an integration runs it before
// its first webhook: every fetched entity goes through the adapter as if a General Webhook had named it. The result says
// whether real Mews data maps to valid HOS facts and what the arrival-readiness projection makes of them. It keeps HOS
// ids, counts and room names, never Mews payloads or customer data.

export type MewsSnapshot = {
  fetchedAt: string;
  enterprise: { id: string; timezone: string };
  accommodationServiceIds: string[];
  reservations: MewsReservation[];
  resources: MewsResource[];
  resourceBlocks: MewsResourceBlock[];
};

export type MewsSyncOptions = { source: string; tenant: string; propertyId: string };

export type MewsArrival = {
  stay_id: string;
  unit: string | null;
  planned_arrival_at: string;
  stay_status: string;
  housekeeping: string | null;
  maintenance: { starts_at: string; ends_at: string } | null;
  readiness: Readiness;
  situation: SituationStatus;
};

export type MewsSyncReport = {
  fetched: { reservations: number; resources: number; resource_blocks: number };
  events: HosFact[];
  events_by_type: Record<string, number>;
  schema_errors: Array<{ id: string; type: string; errors: unknown }>;
  unmapped: Array<{ event: string; reason: string; count: number }>;
  failures: Array<{ event: string; id: string; error: string }>;
  // Facts a second pass over the same snapshot publishes: an idempotent adapter publishes none.
  resync_events: number;
  manifest: ProducerManifest;
  dispositions: Partial<Record<Disposition, number>>;
  situations: Record<string, number>;
  arrivals: { business_date: string; stays: MewsArrival[] };
};

// On a property that runs Mews alone, the PMS is the authority for everything the mapping publishes.
export function mewsManifest({ source, propertyId }: MewsSyncOptions): ProducerManifest {
  const types: Array<HosFact["type"]> = ["reservation.created", "reservation.updated", "reservation.cancelled", "stay.expected", "stay.unit_assigned", "stay.unit_unassigned", "stay.checked_in", "stay.checked_out", "unit.maintenance_scheduled", "unit.maintenance_cancelled"];
  return {
    hosmanifestversion: "0.1",
    producer: source,
    name: "Mews Connector API (live check)",
    organization: { name: "HOS AI experimental mapping" },
    system_role: "pms",
    property_ids: [propertyId],
    entities: ["Reservation", "Stay", "Unit", "Guest"],
    events: [...types.map((type) => ({ type, authoritative: true })), { type: "unit.status_changed", dimensions: ["housekeeping", "maintenance"], authoritative: true }],
    delivery: { mechanisms: ["webhook", "polling"], guarantee: "at-least-once", ordering: "none" },
    replay: { supported: false },
    retention: { event_days: 0 },
    limitations: ["Synchronised from Get all operations; Mews dates assignments and room states by the entity's last update.", "Nothing is retained: each run starts from an empty crosswalk."],
  };
}

const tally = <T>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [key(item)]: (counts[key(item)] ?? 0) + 1 }), {});

export function syncMews(snapshot: MewsSnapshot, options: MewsSyncOptions): MewsSyncReport {
  let minted = 0;
  const identities = createIdentityRegistry({}, () => String(++minted).padStart(4, "0"));
  const { timezone } = snapshot.enterprise;
  const adapter = createMewsAdapter({
    source: options.source,
    tenant: options.tenant,
    properties: [{ enterpriseId: snapshot.enterprise.id, propertyId: options.propertyId, timezone, accommodationServiceIds: snapshot.accommodationServiceIds }],
    identities,
  });

  // Units first, then their blocks, then the reservations that use them, as an integration would load a property.
  const named: Array<[string, Array<{ Id: string }>]> = [
    ["ResourceUpdated", snapshot.resources],
    ["ResourceBlockUpdated", snapshot.resourceBlocks],
    ["ServiceOrderUpdated", snapshot.reservations],
  ];
  const deliver = () => {
    const events: HosFact[] = [];
    const unmapped: Unmapped[] = [];
    const failures: MewsSyncReport["failures"] = [];
    for (const [discriminator, entities] of named) {
      for (const { Id } of entities) {
        // One delivery per entity, so a payload the adapter cannot read fails alone.
        try {
          const result = adapter.handle({
            received_at: snapshot.fetchedAt,
            webhook: { EnterpriseId: snapshot.enterprise.id, IntegrationId: "live-check", Events: [{ Discriminator: discriminator, Value: { Id } }] },
            reservations: snapshot.reservations,
            resources: snapshot.resources,
            resourceBlocks: snapshot.resourceBlocks,
          });
          events.push(...result.events);
          unmapped.push(...result.unmapped);
        } catch (error) {
          failures.push({ event: discriminator, id: Id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return { events, unmapped, failures };
  };

  const { events, unmapped, failures } = deliver();
  const resync = deliver();
  const manifest = mewsManifest(options);
  if (!validateManifest(manifest)) throw new Error(`Invalid live-check manifest: ${JSON.stringify(validateManifest.errors)}`);

  const steps = replayArrivalReadiness(events, [manifest], { ready_housekeeping_statuses: ["clean", "inspected"] });
  const unitNames = new Map(snapshot.resources.map((resource) => [identities.resolve("unit", resource.Id), resource.Name]));
  const businessDate = localDate(snapshot.fetchedAt, timezone);
  const stays = Object.values(steps.at(-1)?.stays ?? {})
    .filter((stay) => localDate(stay.planned_arrival_at, timezone) === businessDate)
    .sort((a, b) => a.planned_arrival_at.localeCompare(b.planned_arrival_at) || a.stay_id.localeCompare(b.stay_id))
    .map((stay) => ({
      stay_id: stay.stay_id,
      unit: stay.unit_id ? (unitNames.get(stay.unit_id) ?? stay.unit_id) : null,
      planned_arrival_at: stay.planned_arrival_at,
      stay_status: stay.stay_status,
      housekeeping: stay.housekeeping?.value ?? null,
      maintenance: stay.maintenance ? { starts_at: stay.maintenance.starts_at, ends_at: stay.maintenance.ends_at } : null,
      readiness: stay.readiness,
      situation: stay.situation,
    }));

  const reasons = new Map<string, { event: string; reason: string; count: number }>();
  for (const { event, reason } of unmapped) {
    const key = `${event}|${reason}`;
    reasons.set(key, { event, reason, count: (reasons.get(key)?.count ?? 0) + 1 });
  }

  return {
    fetched: { reservations: snapshot.reservations.length, resources: snapshot.resources.length, resource_blocks: snapshot.resourceBlocks.length },
    events,
    events_by_type: tally(events, (event) => event.type),
    schema_errors: events.flatMap((event) => (validateEvent(event) ? [] : [{ id: event.id, type: event.type, errors: validateEvent.errors }])),
    unmapped: [...reasons.values()].sort((a, b) => b.count - a.count),
    failures,
    resync_events: resync.events.length,
    manifest,
    dispositions: tally(steps, (step) => step.disposition),
    situations: tally(
      steps.flatMap((step) => step.emitted),
      (situation) => situation.type,
    ),
    arrivals: { business_date: businessDate, stays },
  };
}

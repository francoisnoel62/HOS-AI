import { localDate, type MappingResult, type Unmapped } from "@/lib/hos/mappings/common";
import { type Disposition, type Readiness, replayArrivalReadiness, type SituationStatus } from "@/lib/hos/projection";
import type { HosFact, ProducerManifest } from "@/lib/hos/types";
import { validateEvent, validateManifest } from "@/lib/hos/validation";

// A first synchronisation of an experimental PMS mapping with a live PMS, as an integration runs it before its first
// webhook: every fetched entity goes through the adapter as if a webhook had named it. The result says whether real PMS
// data maps to valid HOS facts and what the arrival-readiness projection makes of them. It keeps HOS ids, counts and room
// names, never PMS payloads or customer data.

export type SyncOptions = { source: string; tenant: string; propertyId: string };

// One fetched entity, handed to the adapter as the webhook that names it would be.
export type SyncDelivery = { event: string; id: string; handle: () => MappingResult };

export type SyncArrival = {
  stay_id: string;
  unit: string | null;
  planned_arrival_at: string;
  stay_status: string;
  housekeeping: string | null;
  maintenance: { starts_at: string; ends_at: string } | null;
  readiness: Readiness;
  situation: SituationStatus;
};

export type SyncReport<Fetched> = {
  fetched: Fetched;
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
  arrivals: { business_date: string; stays: SyncArrival[] };
};

// On a property that runs the PMS alone, the PMS is the authority for everything its mapping publishes.
export function liveManifest(
  { source, propertyId }: SyncOptions,
  { name, types, dimensions, limitations }: { name: string; types: Array<HosFact["type"]>; dimensions: NonNullable<ProducerManifest["events"][number]["dimensions"]>; limitations: string[] },
): ProducerManifest {
  return {
    hosmanifestversion: "0.1",
    producer: source,
    name,
    organization: { name: "HOS AI experimental mapping" },
    system_role: "pms",
    property_ids: [propertyId],
    entities: ["Reservation", "Stay", "Unit", "Guest"],
    events: [...types.map((type) => ({ type, authoritative: true })), { type: "unit.status_changed", dimensions, authoritative: true }],
    delivery: { mechanisms: ["webhook", "polling"], guarantee: "at-least-once", ordering: "none" },
    replay: { supported: false },
    retention: { event_days: 0 },
    limitations: [...limitations, "Nothing is retained: each run starts from an empty crosswalk."],
  };
}

const tally = <T>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [key(item)]: (counts[key(item)] ?? 0) + 1 }), {});

// Delivers every entity twice through the same adapter, then replays the first pass. unitNames, called once both passes
// are done, maps HOS unit ids to the room names people read.
export function synchronise<Fetched>({
  fetched,
  fetchedAt,
  timezone,
  deliveries,
  manifest,
  unitNames,
}: {
  fetched: Fetched;
  fetchedAt: string;
  timezone: string;
  deliveries: SyncDelivery[];
  manifest: ProducerManifest;
  unitNames: () => Map<string, string>;
}): SyncReport<Fetched> {
  const deliver = () => {
    const events: HosFact[] = [];
    const unmapped: Unmapped[] = [];
    const failures: SyncReport<Fetched>["failures"] = [];
    for (const { event, id, handle } of deliveries) {
      // One delivery per entity, so a payload the adapter cannot read fails alone.
      try {
        const result = handle();
        events.push(...result.events);
        unmapped.push(...result.unmapped);
      } catch (error) {
        failures.push({ event, id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { events, unmapped, failures };
  };

  const { events, unmapped, failures } = deliver();
  const resync = deliver();
  if (!validateManifest(manifest)) throw new Error(`Invalid live-check manifest: ${JSON.stringify(validateManifest.errors)}`);

  const steps = replayArrivalReadiness(events, [manifest], { ready_housekeeping_statuses: ["clean", "inspected"] });
  const names = unitNames();
  const businessDate = localDate(fetchedAt, timezone);
  const stays = Object.values(steps.at(-1)?.stays ?? {})
    .filter((stay) => localDate(stay.planned_arrival_at, timezone) === businessDate)
    .sort((a, b) => a.planned_arrival_at.localeCompare(b.planned_arrival_at) || a.stay_id.localeCompare(b.stay_id))
    .map((stay) => ({
      stay_id: stay.stay_id,
      unit: stay.unit_id ? (names.get(stay.unit_id) ?? stay.unit_id) : null,
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
    fetched,
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

import type {
  ConflictRef,
  EventRef,
  FactRef,
  GuestMessageReceived,
  HosFact,
  HousekeepingTaskCompleted,
  HousekeepingTaskCreated,
  MaintenanceRef,
  ProducerManifest,
  ProjectionConfig,
  RoomReadinessAtRisk,
  RoomReadinessResolved,
  Situation,
  StayCheckedIn,
  StayCheckedOut,
  StayCheckInReverted,
  StayExpected,
  StayUnitAssigned,
  StayUnitUnassigned,
  TaskRef,
  UnitMaintenanceCancelled,
  UnitMaintenanceScheduled,
  UnitStatusChanged,
  UnitStatusDimension,
} from "@/lib/hos/types";

// Reference implementation of the non-normative arrival-readiness projection over HOS Events 0.1. It applies the
// normative processing rules (deduplication, occurrence order, declared capability and authority, snapshots) and is
// deliberately small and dependency-free so the demo and the conformance tests exercise exactly the published rules.

export const projectionSource = "urn:hos:projection:arrival-readiness";

export type Disposition = "applied" | "duplicate" | "superseded" | "non_authoritative" | "undeclared_capability";
export type Readiness = "unknown" | "not_ready" | "ready";
export type SituationStatus = "none" | "at_risk" | "resolved";
export type StayStatus = "expected" | "in_house" | "departed" | "cancelled";

export type StayView = {
  stay_id: string;
  reservation_id: string;
  unit_id: string | null;
  planned_arrival_at: string;
  reservation_status: string | null;
  stay_status: StayStatus;
  housekeeping: FactRef | null;
  conflicts: ConflictRef[];
  latest_task: TaskRef | null;
  maintenance: MaintenanceRef | null;
  arrival: (FactRef & { confidence?: number }) | null;
  early: boolean;
  readiness: Readiness;
  situation: SituationStatus;
};

export type ReplayStep = {
  delivery: number;
  event: HosFact;
  disposition: Disposition;
  stays: Record<string, StayView>;
  emitted: Situation[];
};

type Occurrence = Pick<HosFact, "time" | "source" | "id">;
type Timed<T> = { value: T; event: HosFact };
type ArrivalSignal = { expected_arrival_at: string; confidence?: number };

// The later occurrence wins. Equal times fall back to source, then id, so every implementation agrees.
function isLater(candidate: Occurrence, current: Occurrence | undefined) {
  if (!current) return true;
  const delta = Date.parse(candidate.time) - Date.parse(current.time);
  if (delta !== 0) return delta > 0;
  if (candidate.source !== current.source) return candidate.source > current.source;
  return candidate.id > current.id;
}

function byOccurrence(a: Occurrence, b: Occurrence) {
  if (isLater(a, b)) return 1;
  return isLater(b, a) ? -1 : 0;
}

function factRef(event: HosFact, value: string): FactRef {
  return { value, source: event.source, event_id: event.id, time: event.time };
}

function statusKey(unitId: string, dimension: string) {
  return `${unitId}|${dimension}`;
}

// A producer may only emit what its manifest declares for the property; anything undeclared is denied.
function findDeclaration(manifests: ProducerManifest[], event: HosFact, dimension?: UnitStatusDimension) {
  const manifest = manifests.find((candidate) => candidate.producer === event.source && candidate.property_ids.includes(event.hosproperty));
  return manifest?.events.find((declared) => declared.type === event.type && (!dimension || !declared.dimensions || declared.dimensions.includes(dimension)));
}

function statusChanges(event: UnitStatusChanged): Array<[UnitStatusDimension, string]> {
  const data = event.data;
  if ("statuses" in data) return Object.entries(data.statuses) as Array<[UnitStatusDimension, string]>;
  return [[data.dimension, data.current]];
}

export function replayArrivalReadiness(events: HosFact[], manifests: ProducerManifest[], config: ProjectionConfig): ReplayStep[] {
  const seen = new Set<string>();
  const reservationStatuses = new Map<string, Timed<string>>();
  const stays = new Map<string, Timed<StayExpected>>();
  const assignments = new Map<string, Timed<StayUnitAssigned | StayUnitUnassigned>>();
  const lifecycles = new Map<string, Timed<StayCheckedIn | StayCheckInReverted | StayCheckedOut>>();
  const statuses = new Map<string, Timed<string>>();
  const observations = new Map<string, Map<string, Timed<string>>>();
  const tasks = new Map<string, Timed<HousekeepingTaskCreated | HousekeepingTaskCompleted>>();
  const arrivals = new Map<string, Timed<ArrivalSignal>>();
  const maintenance = new Map<string, Timed<UnitMaintenanceScheduled | UnitMaintenanceCancelled>>();
  const situations = new Map<string, SituationStatus>();
  // Whether a maintenance window blocked each stay's unit at the last assessment, to name what resolved a risk.
  const blocked = new Map<string, boolean>();

  function keepLatest<T>(map: Map<string, Timed<T>>, key: string, value: T, event: HosFact): Disposition {
    if (!isLater(event, map.get(key)?.event)) return "superseded";
    map.set(key, { value, event });
    return "applied";
  }

  function observe(key: string, value: string, event: HosFact): Disposition {
    const bySource = observations.get(key) ?? new Map<string, Timed<string>>();
    observations.set(key, bySource);
    return keepLatest(bySource, event.source, value, event) === "applied" ? "non_authoritative" : "superseded";
  }

  function ingestUnitStatus(event: UnitStatusChanged): Disposition {
    const snapshot = event.hosdatamode === "snapshot";
    const outcomes = statusChanges(event).map(([dimension, value]) => {
      const declaration = findDeclaration(manifests, event, dimension);
      if (!declaration || (snapshot && !declaration.snapshot)) return "undeclared_capability";
      const key = statusKey(event.data.unit_id, dimension);
      return declaration.authoritative ? keepLatest(statuses, key, value, event) : observe(key, value, event);
    });
    // A snapshot reports the strongest effect among its dimensions.
    for (const disposition of ["applied", "non_authoritative", "superseded"] as const) if (outcomes.includes(disposition)) return disposition;
    return "undeclared_capability";
  }

  function ingestMessage(event: GuestMessageReceived): Disposition {
    const signal = event.data.signals?.filter((item) => item.kind === "early_arrival" || item.kind === "late_arrival").at(-1);
    if (!signal || !event.data.stay_id) return "applied";
    return keepLatest(arrivals, event.data.stay_id, { expected_arrival_at: signal.expected_arrival_at, confidence: signal.confidence }, event);
  }

  function ingest(event: HosFact): Disposition {
    const identity = `${event.source}\u0000${event.id}`;
    if (seen.has(identity)) return "duplicate";
    seen.add(identity);

    if (event.type === "unit.status_changed") return ingestUnitStatus(event);
    const declaration = findDeclaration(manifests, event);
    if (!declaration) return "undeclared_capability";
    if (!declaration.authoritative) return "non_authoritative";

    switch (event.type) {
      case "reservation.created":
        return keepLatest(reservationStatuses, event.data.reservation_id, event.data.status, event);
      case "reservation.updated":
        return event.data.status ? keepLatest(reservationStatuses, event.data.reservation_id, event.data.status, event) : "applied";
      case "reservation.cancelled":
        return keepLatest(reservationStatuses, event.data.reservation_id, "cancelled", event);
      case "stay.expected":
        return keepLatest(stays, event.data.stay_id, event, event);
      case "stay.unit_assigned":
        return keepLatest(assignments, event.data.stay_id, event, event);
      case "stay.unit_unassigned": {
        // A release frees only the unit the stay holds; releasing another unit changes nothing.
        const held = assignments.get(event.data.stay_id)?.value;
        if (held?.type === "stay.unit_assigned" && held.data.unit_id !== event.data.unit_id) return "superseded";
        return keepLatest(assignments, event.data.stay_id, event, event);
      }
      case "stay.checked_in":
      case "stay.check_in_reverted":
      case "stay.checked_out":
        return keepLatest(lifecycles, event.data.stay_id, event, event);
      case "housekeeping.task.created":
      case "housekeeping.task.completed":
        return event.data.unit_id ? keepLatest(tasks, event.data.unit_id, event, event) : "applied";
      case "unit.maintenance_scheduled":
      case "unit.maintenance_cancelled":
        return keepLatest(maintenance, event.data.maintenance_id, event, event);
      case "guest.message.received":
        return ingestMessage(event);
    }
  }

  function assess(stay: StayExpected) {
    const reservation = reservationStatuses.get(stay.data.reservation_id);
    const assignment = assignments.get(stay.data.stay_id);
    const lifecycle = lifecycles.get(stay.data.stay_id);
    const unitId = assignment?.value.type === "stay.unit_assigned" ? assignment.value.data.unit_id : null;
    const status = unitId ? statuses.get(statusKey(unitId, "housekeeping")) : undefined;
    const conflicting =
      unitId && status
        ? [...(observations.get(statusKey(unitId, "housekeeping"))?.values() ?? [])]
            .filter((observation) => observation.value !== status.value && !isLater(status.event, observation.event))
            .sort((a, b) => byOccurrence(a.event, b.event))
        : [];
    const task = unitId ? tasks.get(unitId) : undefined;
    const signal = arrivals.get(stay.data.stay_id);

    const reservationActive = !reservation || reservation.value === "confirmed" || reservation.value === "tentative";
    // A reverted check-in makes the stay expected again.
    const stayStatus: StayStatus = !reservationActive ? "cancelled" : lifecycle?.value.type === "stay.checked_out" ? "departed" : lifecycle?.value.type === "stay.checked_in" ? "in_house" : "expected";
    const early = Boolean(signal) && Date.parse(signal!.value.expected_arrival_at) < Date.parse(stay.data.planned_arrival_at);
    // A maintenance window on the assigned unit that covers the moment the guest is expected makes the unit unavailable.
    const expectedAt = Date.parse(signal?.value.expected_arrival_at ?? stay.data.planned_arrival_at);
    const window = unitId
      ? [...maintenance.values()]
          .flatMap(({ value, event }) => (value.type === "unit.maintenance_scheduled" ? [{ value, event }] : []))
          .filter(({ value }) => value.data.unit_id === unitId && Date.parse(value.data.starts_at) <= expectedAt && expectedAt < Date.parse(value.data.ends_at))
          .sort((a, b) => byOccurrence(a.event, b.event))
          .at(-1)
      : undefined;
    const readiness: Readiness = window ? "not_ready" : !status || status.value === "unknown" ? "unknown" : config.ready_housekeeping_statuses.includes(status.value) ? "ready" : "not_ready";

    const facts = [reservation?.event, stay, assignment?.event, status?.event, ...conflicting.map((item) => item.event), task?.event, signal?.event, window?.event]
      .filter((fact): fact is HosFact => Boolean(fact))
      .filter((fact, index, all) => all.indexOf(fact) === index)
      .sort(byOccurrence);

    const view: StayView = {
      stay_id: stay.data.stay_id,
      reservation_id: stay.data.reservation_id,
      unit_id: unitId,
      planned_arrival_at: stay.data.planned_arrival_at,
      reservation_status: reservation?.value ?? null,
      stay_status: stayStatus,
      housekeeping: status ? factRef(status.event, status.value) : null,
      conflicts: conflicting.map((observation) => ({ dimension: "housekeeping", ...factRef(observation.event, observation.value) })),
      latest_task: task
        ? {
            task_id: task.value.data.task_id,
            task_type: task.value.data.task_type,
            status: task.value.type === "housekeeping.task.completed" ? "completed" : "open",
            source: task.event.source,
            event_id: task.event.id,
            time: task.event.time,
          }
        : null,
      maintenance: window
        ? { maintenance_id: window.value.data.maintenance_id, starts_at: window.value.data.starts_at, ends_at: window.value.data.ends_at, statuses: window.value.data.statuses, source: window.event.source, event_id: window.event.id, time: window.event.time }
        : null,
      arrival: signal ? { ...factRef(signal.event, signal.value.expected_arrival_at), ...(signal.value.confidence === undefined ? {} : { confidence: signal.value.confidence }) } : null,
      early,
      readiness,
      situation: situations.get(stay.data.stay_id) ?? "none",
    };
    const reason: RoomReadinessResolved["data"]["reason"] = !reservationActive
      ? "reservation_inactive"
      : stayStatus !== "expected"
        ? "stay_started"
        : readiness === "ready"
          ? "unit_ready"
          : blocked.get(stay.data.stay_id) && !window
            ? "unit_available"
            : "arrival_not_early";
    blocked.set(stay.data.stay_id, Boolean(window));
    return { view, facts, atRisk: stayStatus === "expected" && (Boolean(window) || (early && readiness !== "ready")), reason };
  }

  function envelope<TType extends Situation["type"]>(type: TType, id: string, stay: StayExpected, view: StayView, facts: HosFact[], trigger: HosFact) {
    const latest = facts[facts.length - 1] ?? trigger;
    const subjects = [`stay:${view.stay_id}`, `reservation:${view.reservation_id}`, ...(view.unit_id ? [`unit:${view.unit_id}`] : [])];
    return {
      specversion: "1.0" as const,
      id,
      source: projectionSource,
      type,
      // A situation occurs when its latest supporting fact occurred, whatever the delivery order.
      time: latest.time,
      datacontenttype: "application/json" as const,
      hosschemaversion: "0.1" as const,
      hosrecordedat: trigger.hosrecordedat,
      hostenant: stay.hostenant,
      hosproperty: stay.hosproperty,
      hospropertytimezone: stay.hospropertytimezone,
      ...(stay.hosbusinessdate ? { hosbusinessdate: stay.hosbusinessdate } : {}),
      hossubjects: subjects.join(" "),
      hoscausationsource: trigger.source,
      hoscausationid: trigger.id,
    };
  }

  const evidence = (facts: HosFact[]): EventRef[] => facts.map((fact) => ({ source: fact.source, id: fact.id }));

  return events.map((event, index) => {
    const delivery = index + 1;
    const disposition = ingest(event);
    const emitted: Situation[] = [];
    const views: Record<string, StayView> = {};

    for (const { value: stay } of [...stays.values()].sort((a, b) => a.value.data.stay_id.localeCompare(b.value.data.stay_id))) {
      const { view, facts, atRisk, reason } = assess(stay);
      const current = situations.get(stay.data.stay_id) ?? "none";
      if (atRisk && current !== "at_risk") {
        const situation: RoomReadinessAtRisk = {
          ...envelope("arrival.room_readiness_at_risk", `${stay.data.stay_id}.at_risk.${delivery}`, stay, view, facts, event),
          data: {
            stay_id: view.stay_id,
            reservation_id: view.reservation_id,
            unit_id: view.unit_id,
            planned_arrival_at: view.planned_arrival_at,
            expected_arrival_at: view.arrival?.value ?? view.planned_arrival_at,
            housekeeping: view.housekeeping,
            conflicts: view.conflicts,
            latest_task: view.latest_task,
            ...(view.maintenance ? { maintenance: view.maintenance } : {}),
            evidence: evidence(facts),
          },
        };
        situations.set(stay.data.stay_id, "at_risk");
        emitted.push(situation);
      } else if (!atRisk && current === "at_risk") {
        const situation: RoomReadinessResolved = {
          ...envelope("arrival.room_readiness_resolved", `${stay.data.stay_id}.resolved.${delivery}`, stay, view, facts, event),
          data: {
            stay_id: view.stay_id,
            reservation_id: view.reservation_id,
            unit_id: view.unit_id,
            reason,
            planned_arrival_at: view.planned_arrival_at,
            expected_arrival_at: view.arrival?.value ?? null,
            housekeeping: view.housekeeping,
            evidence: evidence(facts),
          },
        };
        situations.set(stay.data.stay_id, "resolved");
        emitted.push(situation);
      }
      views[stay.data.stay_id] = { ...view, situation: situations.get(stay.data.stay_id) ?? "none" };
    }

    return { delivery, event, disposition, stays: views, emitted };
  });
}

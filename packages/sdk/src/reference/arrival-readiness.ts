import { authority, byOccurrence, type Disposition, factKey, isLater, statusChanges } from "../processing.ts";
import type {
  GuestMessageReceived,
  HosFact,
  HousekeepingTaskCompleted,
  HousekeepingTaskCreated,
  ProducerManifest,
  StayCheckedIn,
  StayCheckedOut,
  StayCheckInReverted,
  StayExpected,
  StayUnitAssigned,
  StayUnitUnassigned,
  UnitMaintenanceCancelled,
  UnitMaintenanceScheduled,
  UnitStatusChanged,
} from "../types.generated.ts";
import type {
  ArrivalRoomReadinessAtRisk,
  ArrivalRoomReadinessResolved,
  ConflictRef,
  EventRef,
  FactRef,
  MaintenanceRef,
  OccupantRef,
  Situation,
  TaskRef,
} from "./types.generated.ts";

// Reference implementation of the non-normative arrival-readiness projection over HOS Events 0.1. It applies the
// normative processing rules of ../processing.ts (deduplication, occurrence order, declared capability and authority,
// snapshots) and is deliberately small and dependency-free so the demo and the conformance tests exercise exactly the
// published rules.

export const projectionSource = "urn:hos:projection:arrival-readiness";

// How a scenario configures the projection: the housekeeping statuses that make a unit ready.
export type ProjectionConfig = { ready_housekeeping_statuses: string[] };

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
  occupied_by: OccupantRef | null;
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

type Timed<T> = { value: T; event: HosFact };
type ArrivalSignal = { expected_arrival_at: string; confidence?: number };

function factRef(event: HosFact, value: string): FactRef {
  return { value, source: event.source, event_id: event.id, time: event.time };
}

function statusKey(unitId: string, dimension: string) {
  return `${unitId}|${dimension}`;
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
  // What each stay's unit looked like at the last assessment, to name what resolved a risk: its id, whether a maintenance
  // window blocked it, and whether another guest was due to hold it when this one arrives.
  const lastUnit = new Map<string, string | null>();
  const blocked = new Map<string, boolean>();
  const overlapped = new Map<string, boolean>();
  const lastOccupant = new Map<string, string | undefined>();

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
    const outcomes = statusChanges(event).map(([dimension, value]) => {
      const standing = authority(manifests, event, dimension);
      if (standing === "undeclared_capability") return standing;
      const key = statusKey(event.data.unit_id, dimension);
      return standing === "authoritative" ? keepLatest(statuses, key, value, event) : observe(key, value, event);
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
    const key = factKey(event);
    if (seen.has(key)) return "duplicate";
    seen.add(key);

    if (event.type === "unit.status_changed") return ingestUnitStatus(event);
    const standing = authority(manifests, event);
    if (standing !== "authoritative") return standing;

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

  // The stay in house in a unit, other than the one being assessed: checked in, not checked out, and still holding it.
  function occupantOf(stayId: string, unitId: string) {
    return [...lifecycles.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([otherId, { value: lifecycle, event }]) => {
        if (otherId === stayId || lifecycle.type !== "stay.checked_in") return [];
        const held = assignments.get(otherId);
        const holds = held ? (held.value.type === "stay.unit_assigned" ? held.value.data.unit_id : null) : lifecycle.data.unit_id;
        return holds === unitId ? [{ stayId: otherId, checkIn: event, assignment: held?.event }] : [];
      })
      .at(0);
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
    const stayStatus: StayStatus = !reservationActive
      ? "cancelled"
      : lifecycle?.value.type === "stay.checked_out"
        ? "departed"
        : lifecycle?.value.type === "stay.checked_in"
          ? "in_house"
          : "expected";
    const early = Boolean(signal) && Date.parse(signal!.value.expected_arrival_at) < Date.parse(stay.data.planned_arrival_at);
    // A maintenance window on the assigned unit that covers the moment the guest is expected makes the unit unavailable.
    const expectedAt = Date.parse(signal?.value.expected_arrival_at ?? stay.data.planned_arrival_at);
    const window = unitId
      ? [...maintenance.values()]
          .flatMap(({ value, event }) => (value.type === "unit.maintenance_scheduled" ? [{ value, event }] : []))
          .filter(
            ({ value }) =>
              value.data.unit_id === unitId && Date.parse(value.data.starts_at) <= expectedAt && expectedAt < Date.parse(value.data.ends_at),
          )
          .sort((a, b) => byOccurrence(a.event, b.event))
          .at(-1)
      : undefined;
    // Another stay still in house in the unit: the unit is not ready for an expected stay until that guest leaves.
    const occupant = unitId && stayStatus === "expected" ? occupantOf(stay.data.stay_id, unitId) : undefined;
    const departure = occupant ? stays.get(occupant.stayId) : undefined;
    // The occupant is due to leave no earlier than this guest is expected.
    const overlap = Boolean(departure) && Date.parse(departure!.value.data.planned_departure_at) >= expectedAt;
    const readiness: Readiness =
      window || occupant
        ? "not_ready"
        : !status || status.value === "unknown"
          ? "unknown"
          : config.ready_housekeeping_statuses.includes(status.value)
            ? "ready"
            : "not_ready";

    // The stay that held this same unit at the last assessment and no longer does: its check-out, or its move, is evidence
    // of the change.
    const former = lastUnit.get(stay.data.stay_id) === unitId ? lastOccupant.get(stay.data.stay_id) : undefined;
    const released =
      former && former !== occupant?.stayId
        ? lifecycles.get(former)?.value.type === "stay.checked_in"
          ? assignments.get(former)?.event
          : lifecycles.get(former)?.event
        : undefined;
    const occupancyFacts = occupant ? [occupant.assignment, occupant.checkIn, departure?.event] : [released];
    const facts = [
      reservation?.event,
      stay,
      assignment?.event,
      status?.event,
      ...conflicting.map((item) => item.event),
      task?.event,
      signal?.event,
      window?.event,
      ...occupancyFacts,
    ]
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
        ? {
            maintenance_id: window.value.data.maintenance_id,
            starts_at: window.value.data.starts_at,
            ends_at: window.value.data.ends_at,
            statuses: window.value.data.statuses,
            source: window.event.source,
            event_id: window.event.id,
            time: window.event.time,
          }
        : null,
      occupied_by: occupant
        ? {
            stay_id: occupant.stayId,
            planned_departure_at: departure?.value.data.planned_departure_at ?? null,
            source: occupant.checkIn.source,
            event_id: occupant.checkIn.id,
            time: occupant.checkIn.time,
          }
        : null,
      arrival: signal
        ? {
            ...factRef(signal.event, signal.value.expected_arrival_at),
            ...(signal.value.confidence === undefined ? {} : { confidence: signal.value.confidence }),
          }
        : null,
      early,
      readiness,
      situation: situations.get(stay.data.stay_id) ?? "none",
    };
    const previous = {
      unit: lastUnit.get(stay.data.stay_id),
      blocked: blocked.get(stay.data.stay_id),
      overlapped: overlapped.get(stay.data.stay_id),
    };
    const reason: ArrivalRoomReadinessResolved["data"]["reason"] = !reservationActive
      ? "reservation_inactive"
      : stayStatus !== "expected"
        ? "stay_started"
        : unitId && previous.unit !== undefined && previous.unit !== unitId
          ? "unit_reassigned"
          : readiness === "ready"
            ? "unit_ready"
            : previous.blocked && !window
              ? "unit_available"
              : previous.overlapped && !occupant
                ? "unit_vacated"
                : previous.overlapped && !overlap
                  ? "departure_before_arrival"
                  : "arrival_not_early";
    lastUnit.set(stay.data.stay_id, unitId);
    lastOccupant.set(stay.data.stay_id, occupant?.stayId);
    blocked.set(stay.data.stay_id, Boolean(window));
    overlapped.set(stay.data.stay_id, overlap);
    return { view, facts, atRisk: stayStatus === "expected" && (Boolean(window) || overlap || (early && readiness !== "ready")), reason };
  }

  function envelope<TType extends Situation["type"]>(
    type: TType,
    id: string,
    stay: StayExpected,
    view: StayView,
    facts: HosFact[],
    trigger: HosFact,
  ) {
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
        const situation: ArrivalRoomReadinessAtRisk = {
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
            ...(view.occupied_by ? { occupied_by: view.occupied_by } : {}),
            evidence: evidence(facts),
          },
        };
        situations.set(stay.data.stay_id, "at_risk");
        emitted.push(situation);
      } else if (!atRisk && current === "at_risk") {
        const situation: ArrivalRoomReadinessResolved = {
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

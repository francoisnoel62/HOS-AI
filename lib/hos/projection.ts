import type {
  ConflictRef,
  EventRef,
  FactRef,
  HosFact,
  ProducerManifest,
  ProjectionConfig,
  ReservationUpdated,
  RoomReadinessAtRisk,
  RoomReadinessResolved,
  Situation,
  StayArrivalSignaled,
  StayExpected,
  TaskCompleted,
  TaskRef,
  UnitStatusChanged,
} from "@/lib/hos/types";

// Reference implementation of the HOS 0.1 arrival-readiness projection. It is deliberately small and
// dependency-free so that the demo and the conformance tests exercise exactly the published rules.

export const projectionSource = "urn:hos:projection:arrival-readiness";

export type Disposition = "applied" | "duplicate" | "superseded" | "non_authoritative" | "undeclared_producer";
export type Readiness = "unknown" | "not_ready" | "ready";
export type SituationStatus = "none" | "at_risk" | "resolved";

export type StayView = {
  stay_id: string;
  reservation_id: string;
  unit_id: string | null;
  planned_checkin_at: string;
  reservation_status: ReservationUpdated["data"]["status"] | null;
  housekeeping: FactRef | null;
  conflicts: ConflictRef[];
  latest_task: TaskRef | null;
  arrival: (FactRef & { channel: string }) | null;
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

function findDeclaration(manifests: ProducerManifest[], event: HosFact) {
  const manifest = manifests.find((candidate) => candidate.producer === event.source && candidate.property_ids.includes(event.hospropertyid));
  const dimension = event.type === "unit.status_changed" ? event.data.dimension : undefined;
  return manifest?.events.find((declared) => declared.type === event.type && (!dimension || !declared.dimensions || declared.dimensions.includes(dimension)));
}

export function replayArrivalReadiness(events: HosFact[], manifests: ProducerManifest[], config: ProjectionConfig): ReplayStep[] {
  const seen = new Set<string>();
  const reservations = new Map<string, ReservationUpdated>();
  const stays = new Map<string, StayExpected>();
  const statuses = new Map<string, UnitStatusChanged>();
  const observations = new Map<string, Map<string, UnitStatusChanged>>();
  const tasks = new Map<string, TaskCompleted>();
  const arrivals = new Map<string, StayArrivalSignaled>();
  const situations = new Map<string, SituationStatus>();

  function keepLatest<T extends HosFact>(map: Map<string, T>, key: string, event: T): Disposition {
    if (!isLater(event, map.get(key))) return "superseded";
    map.set(key, event);
    return "applied";
  }

  function ingest(event: HosFact): Disposition {
    const identity = `${event.source}\u0000${event.id}`;
    if (seen.has(identity)) return "duplicate";
    seen.add(identity);

    const declaration = findDeclaration(manifests, event);
    if (!declaration) return "undeclared_producer";
    if (!declaration.authoritative) {
      // Non-authoritative facts are kept per source so disagreements stay visible; they never replace the authority.
      if (event.type !== "unit.status_changed") return "non_authoritative";
      const key = statusKey(event.data.unit_id, event.data.dimension);
      const bySource = observations.get(key) ?? new Map<string, UnitStatusChanged>();
      observations.set(key, bySource);
      return keepLatest(bySource, event.source, event) === "applied" ? "non_authoritative" : "superseded";
    }

    switch (event.type) {
      case "reservation.updated":
        return keepLatest(reservations, event.data.reservation_id, event);
      case "stay.expected":
        return keepLatest(stays, event.data.stay_id, event);
      case "unit.status_changed":
        return keepLatest(statuses, statusKey(event.data.unit_id, event.data.dimension), event);
      case "task.completed":
        return keepLatest(tasks, event.data.unit_id, event);
      case "stay.arrival_signaled":
        return keepLatest(arrivals, event.data.stay_id, event);
    }
  }

  function assess(stay: StayExpected) {
    const reservation = reservations.get(stay.data.reservation_id);
    const unitId = stay.data.unit_id;
    const status = unitId ? statuses.get(statusKey(unitId, "housekeeping")) : undefined;
    const conflicting =
      unitId && status
        ? [...(observations.get(statusKey(unitId, "housekeeping"))?.values() ?? [])]
            .filter((observation) => observation.data.current !== status.data.current && !isLater(status, observation))
            .sort(byOccurrence)
        : [];
    const task = unitId ? tasks.get(unitId) : undefined;
    const signal = arrivals.get(stay.data.stay_id);

    const active = !reservation || reservation.data.status === "confirmed" || reservation.data.status === "tentative";
    const early = Boolean(signal) && Date.parse(signal!.data.expected_arrival_at) < Date.parse(stay.data.planned_checkin_at);
    const readiness: Readiness = !status ? "unknown" : config.ready_housekeeping_statuses.includes(status.data.current) ? "ready" : "not_ready";

    const facts: HosFact[] = [reservation, stay, status, ...conflicting, task, signal].filter((fact): fact is HosFact => Boolean(fact));
    const view: StayView = {
      stay_id: stay.data.stay_id,
      reservation_id: stay.data.reservation_id,
      unit_id: unitId,
      planned_checkin_at: stay.data.planned_checkin_at,
      reservation_status: reservation?.data.status ?? null,
      housekeeping: status ? factRef(status, status.data.current) : null,
      conflicts: conflicting.map((observation) => ({ dimension: "housekeeping", ...factRef(observation, observation.data.current) })),
      latest_task: task ? { task_id: task.data.task_id, task_type: task.data.task_type, source: task.source, event_id: task.id, time: task.time } : null,
      arrival: signal ? { ...factRef(signal, signal.data.expected_arrival_at), channel: signal.data.channel } : null,
      early,
      readiness,
      situation: situations.get(stay.data.stay_id) ?? "none",
    };
    const reason: RoomReadinessResolved["data"]["reason"] = !active ? "reservation_inactive" : readiness === "ready" ? "unit_ready" : "arrival_not_early";
    return { view, facts: facts.sort(byOccurrence), atRisk: active && early && readiness !== "ready", reason };
  }

  function envelope<TType extends Situation["type"]>(type: TType, id: string, stay: StayExpected, facts: HosFact[], trigger: HosFact) {
    const latest = facts[facts.length - 1] ?? trigger;
    return {
      specversion: "1.0" as const,
      type,
      source: projectionSource,
      id,
      // A situation occurs when its latest supporting fact occurred, whatever the delivery order.
      time: latest.time,
      subject: stay.data.stay_id,
      datacontenttype: "application/json" as const,
      hosschemaversion: "0.1" as const,
      hosrecordedat: trigger.hosrecordedat,
      hosbusinessdate: stay.hosbusinessdate,
      hostimezone: stay.hostimezone,
      hospropertyid: stay.hospropertyid,
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

    for (const stay of [...stays.values()].sort((a, b) => a.data.stay_id.localeCompare(b.data.stay_id))) {
      const { view, facts, atRisk, reason } = assess(stay);
      const current = situations.get(stay.data.stay_id) ?? "none";
      if (atRisk && current !== "at_risk") {
        const situation: RoomReadinessAtRisk = {
          ...envelope("arrival.room_readiness_at_risk", `${stay.data.stay_id}.at_risk.${delivery}`, stay, facts, event),
          data: {
            stay_id: view.stay_id,
            reservation_id: view.reservation_id,
            unit_id: view.unit_id,
            planned_checkin_at: view.planned_checkin_at,
            expected_arrival_at: view.arrival!.value,
            housekeeping: view.housekeeping,
            conflicts: view.conflicts,
            latest_task: view.latest_task,
            evidence: evidence(facts),
          },
        };
        situations.set(stay.data.stay_id, "at_risk");
        emitted.push(situation);
      } else if (!atRisk && current === "at_risk") {
        const situation: RoomReadinessResolved = {
          ...envelope("arrival.room_readiness_resolved", `${stay.data.stay_id}.resolved.${delivery}`, stay, facts, event),
          data: {
            stay_id: view.stay_id,
            reservation_id: view.reservation_id,
            unit_id: view.unit_id,
            reason,
            planned_checkin_at: view.planned_checkin_at,
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

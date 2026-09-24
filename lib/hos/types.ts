// Types for HOS 0.1 events. The published JSON Schema in public/spec/0.1/schemas is the source of truth.

type Envelope<TType extends string, TData> = {
  specversion: "1.0";
  type: TType;
  source: string;
  id: string;
  time: string;
  subject?: string;
  datacontenttype: "application/json";
  hosschemaversion: "0.1";
  hosrecordedat: string;
  hosbusinessdate: string;
  hostimezone: string;
  hospropertyid: string;
  hoscausationsource?: string;
  hoscausationid?: string;
  data: TData;
};

export type ReservationUpdated = Envelope<
  "reservation.updated",
  { reservation_id: string; status: "tentative" | "confirmed" | "cancelled" | "no_show"; arrival_date: string; departure_date: string; guest_ref: string }
>;

export type StayExpected = Envelope<
  "stay.expected",
  { stay_id: string; reservation_id: string; unit_id: string | null; guest_ref: string; arrival_date: string; planned_checkin_at: string }
>;

export type UnitStatusChanged = Envelope<
  "unit.status_changed",
  { unit_id: string; dimension: "housekeeping" | "occupancy" | "maintenance"; previous: string | null; current: string; authority: string }
>;

export type TaskCompleted = Envelope<
  "task.completed",
  { task_id: string; unit_id: string; task_type: "cleaning" | "inspection" | "maintenance" | "other"; completed_by_ref?: string }
>;

export type StayArrivalSignaled = Envelope<
  "stay.arrival_signaled",
  { stay_id: string; expected_arrival_at: string; channel: string; message_ref: string }
>;

export type HosFact = ReservationUpdated | StayExpected | UnitStatusChanged | TaskCompleted | StayArrivalSignaled;

export type FactRef = { value: string; source: string; event_id: string; time: string };
export type ConflictRef = FactRef & { dimension: string };
export type EventRef = { source: string; id: string };
export type TaskRef = { task_id: string; task_type: string; source: string; event_id: string; time: string };

export type RoomReadinessAtRisk = Envelope<
  "arrival.room_readiness_at_risk",
  {
    stay_id: string;
    reservation_id: string;
    unit_id: string | null;
    planned_checkin_at: string;
    expected_arrival_at: string;
    housekeeping: FactRef | null;
    conflicts: ConflictRef[];
    latest_task: TaskRef | null;
    evidence: EventRef[];
  }
>;

export type RoomReadinessResolved = Envelope<
  "arrival.room_readiness_resolved",
  {
    stay_id: string;
    reservation_id: string;
    unit_id: string | null;
    reason: "unit_ready" | "arrival_not_early" | "reservation_inactive";
    planned_checkin_at: string;
    expected_arrival_at: string | null;
    housekeeping: FactRef | null;
    evidence: EventRef[];
  }
>;

export type Situation = RoomReadinessAtRisk | RoomReadinessResolved;

export type ProducerManifest = {
  hosmanifestversion: "0.1";
  producer: string;
  name: string;
  system_role: "pms" | "housekeeping" | "maintenance" | "messaging" | "other";
  property_ids: string[];
  events: Array<{ type: HosFact["type"]; dimensions?: string[]; authoritative: boolean; note?: string }>;
  delivery: { guarantee: string; ordering: string };
  replay: { supported: boolean; window_hours?: number };
  retention: { event_days: number };
};

export type ProjectionConfig = { ready_housekeeping_statuses: string[] };

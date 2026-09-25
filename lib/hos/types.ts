// Types for HOS Core 0.1 and HOS Events 0.1. The published JSON Schemas in public/spec/0.1/schemas are the source of truth.

export type UnitStatusDimension = "occupancy" | "housekeeping" | "maintenance" | "commercial";
export type SensitivityClass = "public" | "internal" | "confidential" | "restricted";
export type TaskType = "cleaning" | "inspection" | "turndown" | "maintenance" | "other";
export type ExternalRef = { source_system: string; id_type: string; source_id: string; verification?: "verified" | "asserted" };
type Extensions = { extensions?: Record<string, Record<string, unknown>> };

type Envelope<TType extends string, TData> = {
  specversion: "1.0";
  id: string;
  source: string;
  type: TType;
  time: string;
  datacontenttype: "application/json";
  dataschema?: string;
  hosschemaversion: "0.1";
  hosrecordedat: string;
  hostimebasis?: "occurred" | "modified" | "recorded";
  hostenant: string;
  hosproperty: string;
  hospropertytimezone: string;
  hosbusinessdate?: string;
  hossubjects: string;
  hosdatamode?: "delta" | "snapshot";
  hossensitivity?: SensitivityClass;
  hoscausationsource?: string;
  hoscausationid?: string;
  hosactor?: string;
  data: TData & Extensions;
};

export type ReservationCreated = Envelope<
  "reservation.created",
  { reservation_id: string; status: "tentative" | "confirmed"; planned_arrival_date: string; planned_departure_date: string; guest_id?: string; external_refs?: ExternalRef[] }
>;
export type ReservationUpdated = Envelope<
  "reservation.updated",
  {
    reservation_id: string;
    changed_fields: Array<"status" | "planned_arrival_date" | "planned_departure_date" | "guest_id" | "external_refs">;
    status?: "tentative" | "confirmed" | "no_show";
    planned_arrival_date?: string;
    planned_departure_date?: string;
    guest_id?: string;
    external_refs?: ExternalRef[];
  }
>;
export type ReservationCancelled = Envelope<"reservation.cancelled", { reservation_id: string; reason?: string }>;
export type StayExpected = Envelope<
  "stay.expected",
  { stay_id: string; reservation_id: string; guest_id?: string; planned_arrival_at: string; planned_departure_at: string }
>;
export type StayCheckedIn = Envelope<"stay.checked_in", { stay_id: string; unit_id: string }>;
export type StayCheckInReverted = Envelope<"stay.check_in_reverted", { stay_id: string; unit_id?: string }>;
export type StayCheckedOut = Envelope<"stay.checked_out", { stay_id: string; unit_id: string }>;
export type StayUnitAssigned = Envelope<"stay.unit_assigned", { stay_id: string; unit_id: string; previous_unit_id: string | null; reason?: string }>;
export type StayUnitUnassigned = Envelope<"stay.unit_unassigned", { stay_id: string; unit_id: string; reason?: string }>;
export type UnitStatusChanged = Envelope<
  "unit.status_changed",
  | { unit_id: string; dimension: UnitStatusDimension; previous?: string; current: string; authority_source: string; reason?: string }
  | { unit_id: string; statuses: Partial<Record<UnitStatusDimension, string>>; authority_source: string; reason: string }
>;
// The statuses a maintenance window imposes while it lasts.
export type MaintenanceWindowStatuses = { maintenance?: "out_of_service"; commercial?: "not_sellable" };
export type UnitMaintenanceScheduled = Envelope<
  "unit.maintenance_scheduled",
  { maintenance_id: string; unit_id: string; starts_at: string; ends_at: string; statuses: MaintenanceWindowStatuses; reason?: "repair" | "renovation" | "internal_use" | "other" }
>;
export type UnitMaintenanceCancelled = Envelope<"unit.maintenance_cancelled", { maintenance_id: string; unit_id: string }>;
export type HousekeepingTaskCreated = Envelope<
  "housekeeping.task.created",
  { task_id: string; unit_id?: string; stay_id?: string; task_type: TaskType; priority: string; due_at?: string }
>;
export type HousekeepingTaskCompleted = Envelope<
  "housekeeping.task.completed",
  { task_id: string; unit_id?: string; stay_id?: string; task_type: TaskType; completed_by_ref?: string }
>;
export type GuestMessageReceived = Envelope<
  "guest.message.received",
  {
    message_id: string;
    channel: string;
    guest_id?: string;
    stay_id?: string;
    sensitivity: SensitivityClass;
    signals?: Array<{ kind: "early_arrival" | "late_arrival"; expected_arrival_at: string; confidence?: number }>;
  }
>;

export type HosFact =
  | ReservationCreated
  | ReservationUpdated
  | ReservationCancelled
  | StayExpected
  | StayCheckedIn
  | StayCheckInReverted
  | StayCheckedOut
  | StayUnitAssigned
  | StayUnitUnassigned
  | UnitStatusChanged
  | UnitMaintenanceScheduled
  | UnitMaintenanceCancelled
  | HousekeepingTaskCreated
  | HousekeepingTaskCompleted
  | GuestMessageReceived;

export type FactRef = { value: string; source: string; event_id: string; time: string };
export type ConflictRef = FactRef & { dimension: UnitStatusDimension };
export type EventRef = { source: string; id: string };
export type MaintenanceRef = { maintenance_id: string; starts_at: string; ends_at: string; statuses: MaintenanceWindowStatuses; source: string; event_id: string; time: string };
export type TaskRef = { task_id: string; task_type: TaskType; status: "open" | "completed"; source: string; event_id: string; time: string };
// The in-house stay that still holds a unit: its latest planned check-out, when known, and its check-in fact.
export type OccupantRef = { stay_id: string; planned_departure_at: string | null; source: string; event_id: string; time: string };

type SituationEnvelope<TType extends string, TData> = Omit<Envelope<TType, TData>, "data"> & { data: TData };

export type RoomReadinessAtRisk = SituationEnvelope<
  "arrival.room_readiness_at_risk",
  {
    stay_id: string;
    reservation_id: string;
    unit_id: string | null;
    planned_arrival_at: string;
    expected_arrival_at: string;
    housekeeping: FactRef | null;
    conflicts: ConflictRef[];
    latest_task: TaskRef | null;
    maintenance?: MaintenanceRef;
    occupied_by?: OccupantRef;
    evidence: EventRef[];
  }
>;

export type RoomReadinessResolved = SituationEnvelope<
  "arrival.room_readiness_resolved",
  {
    stay_id: string;
    reservation_id: string;
    unit_id: string | null;
    reason: "unit_ready" | "unit_available" | "unit_reassigned" | "unit_vacated" | "departure_before_arrival" | "arrival_not_early" | "reservation_inactive" | "stay_started";
    planned_arrival_at: string;
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
  organization: { name: string; url?: string };
  system_role: "pms" | "housekeeping" | "maintenance" | "messaging" | "integration" | "other";
  property_ids: string[];
  entities?: string[];
  events: Array<{ type: HosFact["type"]; dimensions?: UnitStatusDimension[]; authoritative: boolean; snapshot?: boolean; note?: string }>;
  delivery: { mechanisms: string[]; guarantee: "at-least-once"; ordering: "none" | "per-subject" | "total" };
  replay: { supported: boolean; window_days?: number; format?: "jsonl" };
  retention: { event_days: number };
  limitations: string[];
};

export type ProjectionConfig = { ready_housekeeping_statuses: string[] };

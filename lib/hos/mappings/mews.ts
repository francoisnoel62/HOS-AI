import {
  createFactWriter,
  createIdentityRegistry,
  type IdentityRegistry,
  localDate,
  type MappingRecording,
  type MappingResult,
  type RecordingAdapter,
  responses,
  type Unmapped,
  utc,
} from "@/lib/hos/mappings/common";
import type {
  ExternalRef,
  ReservationCancelled,
  ReservationCreated,
  ReservationUpdated,
  StayCheckedIn,
  StayCheckedOut,
  StayExpected,
  StayUnitAssigned,
  StayUnitUnassigned,
  UnitMaintenanceCancelled,
  UnitMaintenanceScheduled,
  UnitStatusChanged,
  UnitStatusDimension,
} from "@/lib/hos/types";

// Experimental, unofficial mapping from the Mews Connector API to HOS Events 0.1, written against Mews's public
// documentation: General Webhooks, Get all reservations (ver 2023-06-06) and Get all resources. It is not affiliated with,
// reviewed or endorsed by Mews. Mews webhooks carry entity ids only, so the integration fetches each entity and the
// adapter compares it with what it has already published: HOS receives facts, never Mews snapshots or profiles.

export type MewsWebhook = {
  EnterpriseId: string;
  IntegrationId: string;
  Events: Array<{ Discriminator: string; Value: { Id: string } }>;
};

export type MewsServiceOrderState = "Inquired" | "Confirmed" | "Started" | "Processed" | "Canceled" | "Optional" | "Requested";

// The documented properties the mapping reads; fetched payloads carry the others unchanged.
export type MewsReservation = {
  Id: string;
  ServiceId: string;
  AccountId: string;
  AccountType: string;
  Number: string;
  State: MewsServiceOrderState;
  CreatedUtc: string;
  UpdatedUtc: string;
  CancelledUtc?: string | null;
  CancellationReason?: string | null;
  AssignedResourceId?: string | null;
  ScheduledStartUtc: string;
  ActualStartUtc?: string | null;
  ScheduledEndUtc: string;
  ActualEndUtc?: string | null;
};

export type MewsResourceState = "Dirty" | "Clean" | "Inspected" | "OutOfService" | "OutOfOrder";

export type MewsResource = {
  Id: string;
  EnterpriseId: string;
  IsActive: boolean;
  ParentResourceId?: string | null;
  Name: string;
  State: MewsResourceState;
  UpdatedUtc: string;
  Data: { Discriminator: string; Value?: unknown };
};

export type MewsPropertyConfig = {
  enterpriseId: string;
  propertyId: string;
  timezone: string;
  // Reservations can be made against any bookable service, such as parking; only these services are stays in a unit.
  accommodationServiceIds: string[];
};

export type MewsAdapterConfig = {
  // The HOS producer this integration publishes as. Its manifest, not this adapter, decides what HOS treats as authoritative.
  source: string;
  tenant: string;
  properties: MewsPropertyConfig[];
  identities: IdentityRegistry;
};

// An out-of-order or internal-use block of one resource, from Get all resource blocks.
export type MewsResourceBlock = {
  Id: string;
  EnterpriseId: string;
  AssignedResourceId: string;
  IsActive: boolean;
  Type: "OutOfOrder" | "InternalUse";
  StartUtc: string;
  EndUtc: string;
  CreatedUtc: string;
  UpdatedUtc: string;
  DeletedUtc?: string | null;
};

// What the integration received and fetched for one webhook message.
export type MewsDelivery = { received_at: string; webhook: MewsWebhook; reservations?: MewsReservation[]; resources?: MewsResource[]; resourceBlocks?: MewsResourceBlock[] };

type PublishedStatus = "tentative" | "confirmed" | "cancelled" | "no_show";

// What HOS has been told about a reservation and its stay. Diffing against this, rather than the previous Mews payload,
// keeps the facts right when webhooks were missed or coalesced.
type PublishedStay = {
  updatedUtc: string;
  status: PublishedStatus;
  arrivalAt: string;
  departureAt: string;
  arrivalDate: string;
  departureDate: string;
  guestId?: string;
  unitId: string | null;
  assignedBefore: boolean;
  checkedIn: boolean;
  checkedOut: boolean;
};

type PublishedUnit = { updatedUtc: string; statuses: Partial<Record<UnitStatusDimension, string>> };
type PublishedWindow = { updatedUtc: string; unitId: string; cancelled: boolean };

const reservationStatuses: Partial<Record<MewsServiceOrderState, "tentative" | "confirmed">> = {
  Optional: "tentative",
  Confirmed: "confirmed",
  Started: "confirmed",
  Processed: "confirmed",
};

const cancellationReasons: Record<string, "guest_request" | "property_request" | "payment_issue"> = {
  RequestedByGuest: "guest_request",
  RequestedByBooker: "guest_request",
  BookedElsewhere: "guest_request",
  PriceTooHigh: "guest_request",
  BookingAbandoned: "guest_request",
  ServiceNotAvailable: "property_request",
  InvalidPayment: "payment_issue",
};

// Mews keeps a single resource state; HOS keeps four independent dimensions.
const resourceStatuses: Record<MewsResourceState, [UnitStatusDimension, string]> = {
  Dirty: ["housekeeping", "dirty"],
  Clean: ["housekeeping", "clean"],
  Inspected: ["housekeeping", "inspected"],
  OutOfService: ["maintenance", "out_of_service"],
  OutOfOrder: ["maintenance", "out_of_service"],
};

const isNewer = (candidate: string, current: string) => Date.parse(candidate) > Date.parse(current);

export function createMewsAdapter(config: MewsAdapterConfig) {
  const stays = new Map<string, PublishedStay>();
  const units = new Map<string, PublishedUnit>();
  const windows = new Map<string, PublishedWindow>();
  const { resolve } = config.identities;

  function handle(delivery: MewsDelivery): MappingResult {
    const unmapped: Unmapped[] = [];
    const property = config.properties.find((candidate) => candidate.enterpriseId === delivery.webhook.EnterpriseId);
    if (!property) return { events: [], unmapped: delivery.webhook.Events.map(({ Discriminator, Value }) => ({ event: Discriminator, id: Value.Id, reason: "The enterprise is not configured as a HOS property." })) };
    const { events, publish } = createFactWriter({ source: config.source, tenant: config.tenant, propertyId: property.propertyId, timezone: property.timezone, recordedAt: delivery.received_at, idPrefix: "mews" });
    const handled = new Set<string>();

    function reservation(mews: MewsReservation, { timezone, accommodationServiceIds }: MewsPropertyConfig) {
      const skip = (reason: string) => unmapped.push({ event: "ServiceOrderUpdated", id: mews.Id, reason });
      if (!accommodationServiceIds.includes(mews.ServiceId)) return skip("Not an accommodation service at this property.");
      let stay = stays.get(mews.Id);
      if (stay && !isNewer(mews.UpdatedUtc, stay.updatedUtc)) return skip("No change since the last fetch.");

      const reservationId = resolve("reservation", mews.Id);
      const stayId = resolve("stay", mews.Id);
      // A company can own a reservation; HOS guests are people.
      const guestId = mews.AccountType === "Customer" ? resolve("guest", mews.AccountId) : undefined;
      const guest = guestId ? { guest_id: guestId } : {};
      const arrivalAt = utc(mews.ScheduledStartUtc);
      const departureAt = utc(mews.ScheduledEndUtc);
      const plan = { arrivalAt, departureAt, arrivalDate: localDate(arrivalAt, timezone), departureDate: localDate(departureAt, timezone) };
      const status = reservationStatuses[mews.State];
      // UpdatedUtc is the reservation's last modification, not the moment of the change it reveals.
      const modified = { timeBasis: "modified" } as const;
      const at = (time: string | null | undefined) => (time ? { time, options: {} } : { time: mews.UpdatedUtc, options: modified });
      const expected = (time: string, options = {}) =>
        publish<StayExpected>(
          "stay.expected",
          mews.Id,
          time,
          [`stay:${stayId}`, `reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])],
          { stay_id: stayId, reservation_id: reservationId, ...guest, planned_arrival_at: arrivalAt, planned_departure_at: departureAt },
          // The stay belongs to its arrival day, whenever it was announced.
          { businessDate: plan.arrivalDate, ...options },
        );

      if (!stay) {
        if (!status) return skip(mews.State === "Canceled" ? "Cancelled before HOS knew the reservation." : `${mews.State} is not a commitment yet; published once Optional or Confirmed.`);
        const refs: ExternalRef[] = [
          { source_system: config.source, id_type: "confirmation_number", source_id: mews.Number, verification: "verified" },
          { source_system: config.source, id_type: "reservation_id", source_id: mews.Id, verification: "verified" },
        ];
        publish<ReservationCreated>("reservation.created", mews.Id, mews.CreatedUtc, [`reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])], {
          reservation_id: reservationId,
          status,
          planned_arrival_date: plan.arrivalDate,
          planned_departure_date: plan.departureDate,
          ...guest,
          external_refs: refs,
        });
        // Mews has no separate expected-arrival moment: a committed accommodation reservation is an expected stay.
        expected(mews.CreatedUtc);
        stay = { updatedUtc: mews.UpdatedUtc, status, ...plan, guestId, unitId: null, assignedBefore: false, checkedIn: false, checkedOut: false };
        stays.set(mews.Id, stay);
      } else if (mews.State === "Canceled") {
        stay.updatedUtc = mews.UpdatedUtc;
        if (stay.status === "cancelled" || stay.status === "no_show") return;
        const cancelled = at(mews.CancelledUtc);
        if (mews.CancellationReason === "NoShow") {
          publish<ReservationUpdated>("reservation.updated", mews.Id, cancelled.time, [`reservation:${reservationId}`], { reservation_id: reservationId, changed_fields: ["status"], status: "no_show" }, cancelled.options);
          stay.status = "no_show";
        } else {
          const reason = cancellationReasons[mews.CancellationReason ?? ""] ?? "other";
          publish<ReservationCancelled>("reservation.cancelled", mews.Id, cancelled.time, [`reservation:${reservationId}`], { reservation_id: reservationId, reason }, cancelled.options);
          stay.status = "cancelled";
        }
        return;
      } else {
        // Only what changed travels, with its new value.
        const update: ReservationUpdated["data"] = { reservation_id: reservationId, changed_fields: [] };
        const change = (field: ReservationUpdated["data"]["changed_fields"][number], value: string) => {
          update.changed_fields.push(field);
          Object.assign(update, { [field]: value });
        };
        if (status && status !== stay.status) change("status", status);
        if (plan.arrivalDate !== stay.arrivalDate) change("planned_arrival_date", plan.arrivalDate);
        if (plan.departureDate !== stay.departureDate) change("planned_departure_date", plan.departureDate);
        if (guestId && guestId !== stay.guestId) change("guest_id", guestId);
        if (update.changed_fields.length) publish<ReservationUpdated>("reservation.updated", mews.Id, mews.UpdatedUtc, [`reservation:${reservationId}`], update, modified);
        if (arrivalAt !== stay.arrivalAt || departureAt !== stay.departureAt) expected(mews.UpdatedUtc, modified);
        Object.assign(stay, { updatedUtc: mews.UpdatedUtc, ...plan, guestId }, status ? { status } : {});
      }

      // Mews stamps the reservation's last update, not the assignment itself.
      const unitId = mews.AssignedResourceId ? resolve("unit", mews.AssignedResourceId) : null;
      if (unitId && unitId !== stay.unitId) {
        publish<StayUnitAssigned>(
          "stay.unit_assigned",
          mews.Id,
          mews.UpdatedUtc,
          [`stay:${stayId}`, `unit:${unitId}`],
          { stay_id: stayId, unit_id: unitId, previous_unit_id: stay.unitId, ...(stay.assignedBefore ? {} : { reason: "initial_assignment" }) },
          modified,
        );
        Object.assign(stay, { unitId, assignedBefore: true });
      } else if (!unitId && stay.unitId) {
        publish<StayUnitUnassigned>("stay.unit_unassigned", mews.Id, mews.UpdatedUtc, [`stay:${stayId}`, `unit:${stay.unitId}`], { stay_id: stayId, unit_id: stay.unitId }, modified);
        stay.unitId = null;
      }

      // Returns whether the fact was published, so a check-in without a unit is tried again on the next fetch.
      const lifecycle = (type: "stay.checked_in" | "stay.checked_out", actual: string | null | undefined) => {
        if (!unitId) {
          skip(`${type} needs a unit, and none is assigned.`);
          return false;
        }
        const { time, options } = at(actual);
        publish<StayCheckedIn | StayCheckedOut>(type, mews.Id, time, [`stay:${stayId}`, `unit:${unitId}`], { stay_id: stayId, unit_id: unitId }, options);
        return true;
      };
      if ((mews.State === "Started" || mews.State === "Processed") && !stay.checkedIn) stay.checkedIn = lifecycle("stay.checked_in", mews.ActualStartUtc);
      if (mews.State === "Processed" && stay.checkedIn && !stay.checkedOut) stay.checkedOut = lifecycle("stay.checked_out", mews.ActualEndUtc);
    }

    function resource(mews: MewsResource) {
      const skip = (reason: string) => unmapped.push({ event: "ResourceUpdated", id: mews.Id, reason });
      if (mews.Data.Discriminator !== "Space" || mews.ParentResourceId) return skip("Not a unit: only top-level space resources are units.");
      if (!mews.IsActive) return skip("Inactive resource.");
      const known = units.get(mews.Id);
      if (known && !isNewer(mews.UpdatedUtc, known.updatedUtc)) return skip("No change since the last fetch.");

      const unitId = resolve("unit", mews.Id);
      const statuses = { ...known?.statuses };
      const [dimension, value] = resourceStatuses[mews.State];
      const changes: Array<[UnitStatusDimension, string]> = [];
      // Leaving OutOfService or OutOfOrder is the only way Mews says a unit is operational again.
      if (dimension === "housekeeping" && statuses.maintenance === "out_of_service") changes.push(["maintenance", "operational"]);
      if (statuses[dimension] !== value) changes.push([dimension, value]);
      for (const [changed, current] of changes) {
        // Mews reports neither the previous state nor why it changed: previous is only what this adapter last published.
        publish<UnitStatusChanged>(
          "unit.status_changed",
          `${mews.Id}/${changed}`,
          mews.UpdatedUtc,
          [`unit:${unitId}`],
          { unit_id: unitId, dimension: changed, ...(statuses[changed] ? { previous: statuses[changed] } : {}), current, authority_source: config.source },
          // UpdatedUtc is the resource's last modification, not necessarily the moment of this change.
          { timeBasis: "modified" },
        );
        statuses[changed] = current;
      }
      units.set(mews.Id, { updatedUtc: mews.UpdatedUtc, statuses });
    }

    // A resource block is a maintenance window: out of order takes the unit out of service and out of sale, internal
    // use only out of sale.
    function block(mews: MewsResourceBlock) {
      const skip = (reason: string) => unmapped.push({ event: "ResourceBlockUpdated", id: mews.Id, reason });
      const known = windows.get(mews.Id);
      if (known && !isNewer(mews.UpdatedUtc, known.updatedUtc)) return skip("No change since the last fetch.");
      const maintenanceId = resolve("maintenance", mews.Id);
      const unitId = resolve("unit", mews.AssignedResourceId);
      windows.set(mews.Id, { updatedUtc: mews.UpdatedUtc, unitId, cancelled: !mews.IsActive || Boolean(mews.DeletedUtc) });
      if (!mews.IsActive || mews.DeletedUtc) {
        if (!known || known.cancelled) return skip(known ? "Already cancelled." : "Deleted before HOS knew the block.");
        const cancelledAt = mews.DeletedUtc ? { time: mews.DeletedUtc, options: {} } : { time: mews.UpdatedUtc, options: { timeBasis: "modified" as const } };
        publish<UnitMaintenanceCancelled>("unit.maintenance_cancelled", mews.Id, cancelledAt.time, [`unit:${known.unitId}`], { maintenance_id: maintenanceId, unit_id: known.unitId }, cancelledAt.options);
        return;
      }
      const internal = mews.Type === "InternalUse";
      publish<UnitMaintenanceScheduled>(
        "unit.maintenance_scheduled",
        mews.Id,
        mews.UpdatedUtc,
        [`unit:${unitId}`],
        {
          maintenance_id: maintenanceId,
          unit_id: unitId,
          starts_at: utc(mews.StartUtc),
          ends_at: utc(mews.EndUtc),
          statuses: internal ? { commercial: "not_sellable" } : { maintenance: "out_of_service", commercial: "not_sellable" },
          ...(internal ? { reason: "internal_use" as const } : {}),
        },
        // A new block is dated by its creation; a changed one only by its last update.
        mews.UpdatedUtc === mews.CreatedUtc ? {} : { timeBasis: "modified" },
      );
    }

    for (const { Discriminator: discriminator, Value } of delivery.webhook.Events) {
      const id = Value.Id;
      if (handled.has(`${discriminator}|${id}`)) continue;
      handled.add(`${discriminator}|${id}`);
      const skip = (reason: string) => unmapped.push({ event: discriminator, id, reason });
      if (discriminator === "ServiceOrderUpdated") {
        const fetched = delivery.reservations?.find((item) => item.Id === id);
        if (fetched) reservation(fetched, property);
        else skip("Not returned by Get all reservations.");
      } else if (discriminator === "ResourceUpdated") {
        const fetched = delivery.resources?.find((item) => item.Id === id);
        if (fetched) resource(fetched);
        else skip("Not returned by Get all resources.");
      } else if (discriminator === "ResourceBlockUpdated") {
        const fetched = delivery.resourceBlocks?.find((item) => item.Id === id);
        if (fetched) block(fetched);
        else skip("Not returned by Get all resource blocks.");
      } else if (discriminator === "CustomerAdded" || discriminator === "CustomerUpdated") {
        skip("Customer profiles are personal data; HOS carries only a pseudonymous guest_id.");
      } else if (discriminator === "MessageAdded") {
        skip("Not mapped: an arrival signal must be extracted from the message, which is not a field mapping.");
      } else {
        skip("No HOS 0.1 counterpart in this mapping.");
      }
    }

    return { events, unmapped };
  }

  return { handle };
}

// Replays a recording's Mews deliveries: each webhook message with the reservations and resources fetched for it.
export function mewsRecordingAdapter({ adapter }: MappingRecording): RecordingAdapter {
  const mews = createMewsAdapter({ ...(adapter as unknown as Omit<MewsAdapterConfig, "identities">), identities: createIdentityRegistry(adapter.crosswalk) });
  return (delivery) => {
    const fetched = responses<{ Reservations?: MewsReservation[]; Resources?: MewsResource[]; ResourceBlocks?: MewsResourceBlock[] }>(delivery);
    return mews.handle({
      received_at: delivery.received_at,
      webhook: delivery.webhook as MewsWebhook,
      reservations: fetched.flatMap((response) => response.Reservations ?? []),
      resources: fetched.flatMap((response) => response.Resources ?? []),
      resourceBlocks: fetched.flatMap((response) => response.ResourceBlocks ?? []),
    });
  };
}

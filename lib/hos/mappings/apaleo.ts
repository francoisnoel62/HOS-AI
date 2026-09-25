import {
  createFactWriter,
  createIdentityRegistry,
  type IdentityRegistry,
  localDate,
  type MappingRecording,
  type MappingResult,
  type RecordingAdapter,
  type Unmapped,
  utc,
} from "@/lib/hos/mappings/common";
import type { ReservationCancelled, ReservationCreated, ReservationUpdated, StayCheckedIn, StayCheckedOut, StayExpected, StayUnitAssigned, UnitStatusChanged, UnitStatusDimension } from "@/lib/hos/types";

// Experimental, unofficial mapping from the Apaleo API to HOS Events 0.1, written against Apaleo's published webhook
// events and its Booking and Inventory API models. It is not affiliated with, reviewed or endorsed by Apaleo. A webhook
// names what happened and carries the entity id and a timestamp; the integration fetches the reservation or unit, and the
// adapter compares it with what it has already published, so HOS receives facts, never Apaleo payloads or guest details.

export type ApaleoWebhook = {
  topic: string;
  type: string;
  id: string;
  accountId: string;
  propertyId?: string;
  // Unix time in milliseconds.
  timestamp: number;
  clientId?: string;
  subjectId?: string;
  data?: { entityId: string };
};

export type ApaleoReservationStatus = "Confirmed" | "InHouse" | "CheckedOut" | "Canceled" | "NoShow";

// The documented properties the mapping reads; fetched payloads carry the others unchanged.
export type ApaleoReservation = {
  id: string;
  bookingId: string;
  status: ApaleoReservationStatus;
  checkInTime?: string;
  checkOutTime?: string;
  cancellationTime?: string;
  noShowTime?: string;
  unit?: { id: string; name?: string };
  property: { id: string };
  unitGroup: { id: string; type?: string };
  arrival: string;
  departure: string;
  created: string;
  modified: string;
};

export type ApaleoUnitCondition = "Clean" | "CleanToBeInspected" | "Dirty";

export type ApaleoUnit = {
  id: string;
  name: string;
  property: { id: string };
  unitGroup?: { id: string; type?: string };
  status: { isOccupied: boolean; condition: ApaleoUnitCondition; maintenance?: { id: string; type: "OutOfService" | "OutOfOrder" | "OutOfInventory" } };
};

export type ApaleoPropertyConfig = {
  apaleoPropertyId: string;
  propertyId: string;
  timezone: string;
  // With inspections, cleaning leaves a unit CleanToBeInspected and only an inspection makes it Clean.
  inspections: boolean;
};

export type ApaleoAdapterConfig = {
  // The HOS producer this integration publishes as. Its manifest, not this adapter, decides what HOS treats as authoritative.
  source: string;
  tenant: string;
  accountId: string;
  properties: ApaleoPropertyConfig[];
  identities: IdentityRegistry;
};

// What the integration received and fetched for one webhook.
export type ApaleoDelivery = { received_at: string; webhook: ApaleoWebhook; reservation?: ApaleoReservation; unit?: ApaleoUnit };

// What HOS has been told about a reservation and its stay.
type PublishedStay = {
  modified: string;
  arrivalAt: string;
  departureAt: string;
  arrivalDate: string;
  departureDate: string;
  unitId: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
  closed: boolean;
};

type Statuses = Partial<Record<UnitStatusDimension, string>>;

const dimensions: UnitStatusDimension[] = ["occupancy", "housekeeping", "maintenance", "commercial"];

// Only bedrooms are HOS units; Apaleo also rents parking lots, meeting rooms and event spaces.
const isBedroom = (unitGroup?: { type?: string }) => !unitGroup?.type || unitGroup.type === "BedRoom";

export function createApaleoAdapter(config: ApaleoAdapterConfig) {
  const stays = new Map<string, PublishedStay>();
  const units = new Map<string, Statuses>();
  const { resolve } = config.identities;

  function handle(delivery: ApaleoDelivery): MappingResult {
    const { webhook } = delivery;
    const event = `${webhook.topic}/${webhook.type}`.toLowerCase();
    const entityId = webhook.data?.entityId ?? webhook.id;
    const unmapped: Unmapped[] = [];
    const skip = (reason: string) => unmapped.push({ event, id: entityId, reason });

    if (event === "system/healthcheck") {
      skip("Health check.");
      return { events: [], unmapped };
    }
    const property = config.properties.find((candidate) => candidate.apaleoPropertyId === webhook.propertyId);
    if (webhook.accountId !== config.accountId || !property) {
      skip("The property is not configured as a HOS property.");
      return { events: [], unmapped };
    }
    const { events, publish } = createFactWriter({ source: config.source, tenant: config.tenant, propertyId: property.propertyId, timezone: property.timezone, recordedAt: delivery.received_at, idPrefix: "apaleo" });
    // Apaleo stamps each event with the moment it happened.
    const occurred = utc(webhook.timestamp);

    function reservation(apaleo: ApaleoReservation) {
      if (!isBedroom(apaleo.unitGroup)) return skip("Not a bedroom reservation.");
      let stay = stays.get(apaleo.id);
      if (stay && Date.parse(apaleo.modified) <= Date.parse(stay.modified)) return skip("No change since the last fetch.");

      const reservationId = resolve("reservation", apaleo.id);
      const stayId = resolve("stay", apaleo.id);
      const arrivalAt = utc(apaleo.arrival);
      const departureAt = utc(apaleo.departure);
      const plan = { arrivalAt, departureAt, arrivalDate: localDate(arrivalAt, property!.timezone), departureDate: localDate(departureAt, property!.timezone) };
      // Apaleo embeds the guest's details in each reservation without a guest id, so there is no pseudonymous guest to link.
      const expected = (time: string) =>
        publish<StayExpected>("stay.expected", apaleo.id, time, [`stay:${stayId}`, `reservation:${reservationId}`], { stay_id: stayId, reservation_id: reservationId, planned_arrival_at: arrivalAt, planned_departure_at: departureAt }, { businessDate: plan.arrivalDate });

      if (!stay) {
        if (apaleo.status === "Canceled" || apaleo.status === "NoShow") return skip("Closed before HOS knew the reservation.");
        publish<ReservationCreated>("reservation.created", apaleo.id, apaleo.created, [`reservation:${reservationId}`], {
          reservation_id: reservationId,
          status: "confirmed",
          planned_arrival_date: plan.arrivalDate,
          planned_departure_date: plan.departureDate,
          external_refs: [
            { source_system: config.source, id_type: "reservation_id", source_id: apaleo.id, verification: "verified" },
            { source_system: config.source, id_type: "booking_id", source_id: apaleo.bookingId, verification: "verified" },
          ],
        });
        // Apaleo has no separate expected-arrival moment: a confirmed bedroom reservation is an expected stay.
        expected(apaleo.created);
        stay = { modified: apaleo.modified, ...plan, unitId: null, checkedIn: false, checkedOut: false, closed: false };
        stays.set(apaleo.id, stay);
      } else {
        const update: ReservationUpdated["data"] = { reservation_id: reservationId, changed_fields: [] };
        if (plan.arrivalDate !== stay.arrivalDate) Object.assign(update, { planned_arrival_date: plan.arrivalDate }).changed_fields.push("planned_arrival_date");
        if (plan.departureDate !== stay.departureDate) Object.assign(update, { planned_departure_date: plan.departureDate }).changed_fields.push("planned_departure_date");
        if (update.changed_fields.length) publish<ReservationUpdated>("reservation.updated", apaleo.id, occurred, [`reservation:${reservationId}`], update);
        if (arrivalAt !== stay.arrivalAt || departureAt !== stay.departureAt) expected(occurred);
        Object.assign(stay, { modified: apaleo.modified, ...plan });
      }

      if (!stay.closed && apaleo.status === "Canceled") {
        publish<ReservationCancelled>("reservation.cancelled", apaleo.id, apaleo.cancellationTime ?? occurred, [`reservation:${reservationId}`], { reservation_id: reservationId });
        stay.closed = true;
      }
      if (!stay.closed && apaleo.status === "NoShow") {
        publish<ReservationUpdated>("reservation.updated", apaleo.id, apaleo.noShowTime ?? occurred, [`reservation:${reservationId}`], { reservation_id: reservationId, changed_fields: ["status"], status: "no_show" });
        stay.closed = true;
      }

      const unitId = apaleo.unit ? resolve("unit", apaleo.unit.id) : null;
      if (unitId && unitId !== stay.unitId) {
        // The unit-assigned event says when; any other event only says the unit was assigned by the last modification.
        publish<StayUnitAssigned>("stay.unit_assigned", apaleo.id, webhook.type === "unit-assigned" ? occurred : apaleo.modified, [`stay:${stayId}`, `unit:${unitId}`], {
          stay_id: stayId,
          unit_id: unitId,
          previous_unit_id: stay.unitId,
          ...(stay.unitId ? {} : { reason: "initial_assignment" }),
        });
        stay.unitId = unitId;
      } else if (webhook.type === "unit-unassigned") {
        skip("HOS 0.1 has no event that removes an assignment.");
      }

      if (webhook.type === "check-in-reverted") skip("HOS 0.1 has no event that reverts a check-in.");
      const unit = unitId ?? stay.unitId;
      if ((apaleo.status === "InHouse" || apaleo.status === "CheckedOut") && !stay.checkedIn && unit) {
        publish<StayCheckedIn>("stay.checked_in", apaleo.id, apaleo.checkInTime ?? occurred, [`stay:${stayId}`, `unit:${unit}`], { stay_id: stayId, unit_id: unit });
        stay.checkedIn = true;
      }
      if (apaleo.status === "CheckedOut" && stay.checkedIn && !stay.checkedOut && unit) {
        publish<StayCheckedOut>("stay.checked_out", apaleo.id, apaleo.checkOutTime ?? occurred, [`stay:${stayId}`, `unit:${unit}`], { stay_id: stayId, unit_id: unit });
        stay.checkedOut = true;
      }
    }

    function unit(apaleo: ApaleoUnit) {
      if (!isBedroom(apaleo.unitGroup)) return skip("Not a bedroom.");
      const unitId = resolve("unit", apaleo.id);
      const published = { ...units.get(apaleo.id) };
      const { isOccupied, condition, maintenance } = apaleo.status;
      // Apaleo already keeps occupancy, cleanliness and maintenance apart, as HOS does.
      const next: Statuses = {
        occupancy: isOccupied ? "occupied" : "vacant",
        housekeeping: condition === "Dirty" ? "dirty" : condition === "CleanToBeInspected" || !property!.inspections ? "clean" : "inspected",
      };
      if (maintenance) next.maintenance = "out_of_service";
      else if (published.maintenance === "out_of_service") next.maintenance = "operational";
      // Out of order and out of inventory units cannot be sold; out of service ones still can.
      if (maintenance && maintenance.type !== "OutOfService") next.commercial = "not_sellable";
      else if (published.commercial === "not_sellable") next.commercial = "sellable";

      const changed = dimensions.filter((dimension) => next[dimension] && next[dimension] !== published[dimension]);
      if (!changed.length) return skip("No status change.");
      for (const dimension of changed) {
        publish<UnitStatusChanged>("unit.status_changed", `${apaleo.id}/${dimension}`, occurred, [`unit:${unitId}`], {
          unit_id: unitId,
          dimension,
          ...(published[dimension] ? { previous: published[dimension] } : {}),
          current: next[dimension]!,
          authority_source: config.source,
        });
      }
      units.set(apaleo.id, { ...published, ...next });
    }

    if (webhook.topic === "Reservation") {
      if (delivery.reservation?.id === entityId) reservation(delivery.reservation);
      else skip("Not returned by the Booking API.");
    } else if (webhook.topic === "Unit") {
      if (delivery.unit?.id === entityId) unit(delivery.unit);
      else skip("Not returned by the Inventory API.");
    } else {
      skip("No HOS 0.1 counterpart in this mapping.");
    }
    return { events, unmapped };
  }

  return { handle };
}

// Replays a recording's Apaleo deliveries: each webhook with the reservation or unit fetched for it.
export function apaleoRecordingAdapter({ adapter }: MappingRecording): RecordingAdapter {
  const apaleo = createApaleoAdapter({ ...(adapter as unknown as Omit<ApaleoAdapterConfig, "identities">), identities: createIdentityRegistry(adapter.crosswalk) });
  return (delivery) => {
    const call = delivery.fetched[0];
    const fetched = call ? { [call.operation.startsWith("GET /inventory/") ? "unit" : "reservation"]: call.response } : {};
    return apaleo.handle({ received_at: delivery.received_at, webhook: delivery.webhook as ApaleoWebhook, ...fetched });
  };
}

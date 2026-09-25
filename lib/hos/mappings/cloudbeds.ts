import {
  createFactWriter,
  createIdentityRegistry,
  type IdentityRegistry,
  type MappingRecording,
  type MappingResult,
  type RecordingAdapter,
  type Unmapped,
  utc,
  zonedTimeToUtc,
} from "@/lib/hos/mappings/common";
import type { ReservationCancelled, ReservationCreated, ReservationUpdated, StayCheckedIn, StayCheckedOut, StayExpected, StayUnitAssigned, UnitStatusChanged, UnitStatusDimension } from "@/lib/hos/types";

// Experimental, unofficial mapping from the Cloudbeds API (v1.3) to HOS Events 0.1, written against Cloudbeds's official
// SDK models and published webhook samples. It is not affiliated with, reviewed or endorsed by Cloudbeds. A webhook names
// what happened and when; the integration fetches the reservation or the housekeeping status, and the adapter compares it
// with what it has already published, so HOS receives facts, never Cloudbeds payloads or guest details.

export type CloudbedsWebhook = {
  version: string;
  event: string;
  // Unix time in seconds, with a fractional part.
  timestamp: number;
  propertyID?: number | string;
  propertyId?: number | string;
  propertyID_str?: string;
  reservationID?: string;
  roomID?: string;
  roomId?: string;
  status?: string;
  actor?: { type: string; id: string };
  startDate?: string;
  endDate?: string;
};

export type CloudbedsReservationStatus = "not_confirmed" | "confirmed" | "canceled" | "checked_in" | "checked_out" | "no_show";

// The documented properties of getReservation the mapping reads; fetched payloads carry the others unchanged.
export type CloudbedsReservation = {
  propertyID: string;
  reservationID: string;
  status: CloudbedsReservationStatus;
  startDate: string;
  endDate: string;
  guestList?: Record<string, { guestID?: string; isMainGuest?: boolean }>;
  assigned?: Array<{ roomID?: string; roomName?: string; roomTypeID?: string; subReservationID?: string }>;
  unassigned?: Array<{ roomTypeID?: string; subReservationID?: string }>;
};

// One room of getHousekeepingStatus.
export type CloudbedsRoomStatus = { roomID?: string; roomName?: string; roomCondition?: string; roomOccupied?: boolean; roomBlocked?: boolean; date?: string };

export type CloudbedsPropertyConfig = {
  cloudbedsPropertyId: string;
  propertyId: string;
  timezone: string;
  // The property's check-in and check-out times, as getHotelDetails reports them in propertyPolicy, in 24-hour HH:MM.
  checkInTime: string;
  checkOutTime: string;
};

export type CloudbedsAdapterConfig = {
  // The HOS producer this integration publishes as. Its manifest, not this adapter, decides what HOS treats as authoritative.
  source: string;
  tenant: string;
  properties: CloudbedsPropertyConfig[];
  identities: IdentityRegistry;
};

// What the integration received and fetched for one webhook.
export type CloudbedsDelivery = { received_at: string; webhook: CloudbedsWebhook; reservation?: CloudbedsReservation; rooms?: CloudbedsRoomStatus[] };

type PublishedStatus = "tentative" | "confirmed" | "cancelled" | "no_show";

// What HOS has been told about a reservation and its stay.
type PublishedStay = {
  status: PublishedStatus;
  arrivalAt: string;
  departureAt: string;
  arrivalDate: string;
  departureDate: string;
  guestId?: string;
  unitId: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
};

type Statuses = Partial<Record<UnitStatusDimension, string>>;

const dimensions: UnitStatusDimension[] = ["occupancy", "housekeeping", "maintenance", "commercial"];
const reservationStatuses: Partial<Record<CloudbedsReservationStatus, "tentative" | "confirmed">> = {
  not_confirmed: "tentative",
  confirmed: "confirmed",
  checked_in: "confirmed",
  checked_out: "confirmed",
};
const roomConditions: Record<string, string> = { dirty: "dirty", clean: "clean", inspected: "inspected" };

export function createCloudbedsAdapter(config: CloudbedsAdapterConfig) {
  const stays = new Map<string, PublishedStay>();
  const units = new Map<string, Statuses>();
  const { resolve } = config.identities;

  function handle(delivery: CloudbedsDelivery): MappingResult {
    const { webhook } = delivery;
    const { event } = webhook;
    const entityId = webhook.reservationID ?? webhook.roomID ?? webhook.roomId ?? "";
    const unmapped: Unmapped[] = [];
    const skip = (reason: string) => unmapped.push({ event, id: entityId, reason });

    // Cloudbeds spells the property id propertyID in reservation events and propertyId in others.
    const property = config.properties.find((candidate) => candidate.cloudbedsPropertyId === String(webhook.propertyID ?? webhook.propertyId ?? ""));
    if (!property) {
      skip("The property is not configured as a HOS property.");
      return { events: [], unmapped };
    }
    const { events, publish } = createFactWriter({ source: config.source, tenant: config.tenant, propertyId: property.propertyId, timezone: property.timezone, recordedAt: delivery.received_at, idPrefix: "cloudbeds" });
    // Cloudbeds stamps each event with the moment it happened.
    const occurred = utc(Math.round(webhook.timestamp * 1000));
    // A fact the event itself reports occurred at the event's time; one only noticed while handling another event did
    // not, so its time is when the adapter learned it.
    const timing = (reportedBy: boolean) => (reportedBy ? {} : { recorded: true });

    function reservation(cloudbeds: CloudbedsReservation) {
      const published = events.length;
      const rooms = [...(cloudbeds.assigned ?? []), ...(cloudbeds.unassigned ?? [])];
      if (rooms.length > 1) return skip("A reservation with several rooms; this adapter maps one stay per reservation.");
      let stay = stays.get(cloudbeds.reservationID);
      const reservationId = resolve("reservation", cloudbeds.reservationID);
      const stayId = resolve("stay", cloudbeds.reservationID);
      const mainGuest = Object.values(cloudbeds.guestList ?? {}).find((guest) => guest.isMainGuest)?.guestID;
      const guestId = mainGuest ? resolve("guest", mainGuest) : undefined;
      const guest = guestId ? { guest_id: guestId } : {};
      // Cloudbeds plans stays in days; the property's check-in and check-out times make them instants.
      const plan = {
        arrivalAt: zonedTimeToUtc(cloudbeds.startDate, property!.checkInTime, property!.timezone),
        departureAt: zonedTimeToUtc(cloudbeds.endDate, property!.checkOutTime, property!.timezone),
        arrivalDate: cloudbeds.startDate,
        departureDate: cloudbeds.endDate,
      };
      const status = reservationStatuses[cloudbeds.status];
      const statusEvent = (value: string) => event === "reservation/status_changed" && webhook.status === value;
      const expected = (recorded: boolean) =>
        publish<StayExpected>(
          "stay.expected",
          cloudbeds.reservationID,
          occurred,
          [`stay:${stayId}`, `reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])],
          { stay_id: stayId, reservation_id: reservationId, ...guest, planned_arrival_at: plan.arrivalAt, planned_departure_at: plan.departureAt },
          { businessDate: plan.arrivalDate, recorded },
        );

      if (!stay) {
        if (!status) return skip("Closed before HOS knew the reservation.");
        const created = event === "reservation/created";
        publish<ReservationCreated>(
          "reservation.created",
          cloudbeds.reservationID,
          occurred,
          [`reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])],
          {
            reservation_id: reservationId,
            status,
            planned_arrival_date: plan.arrivalDate,
            planned_departure_date: plan.departureDate,
            ...guest,
            external_refs: [{ source_system: config.source, id_type: "reservation_id", source_id: cloudbeds.reservationID, verification: "verified" }],
          },
          timing(created),
        );
        // Cloudbeds has no separate expected-arrival moment: a committed reservation is an expected stay.
        expected(!created);
        stay = { status, ...plan, guestId, unitId: null, checkedIn: false, checkedOut: false };
        stays.set(cloudbeds.reservationID, stay);
      } else {
        const closed = stay.status === "cancelled" || stay.status === "no_show";
        if (cloudbeds.status === "canceled") {
          // Cloudbeds reports no cancellation reason.
          if (!closed) publish<ReservationCancelled>("reservation.cancelled", cloudbeds.reservationID, occurred, [`reservation:${reservationId}`], { reservation_id: reservationId }, timing(statusEvent("canceled")));
          stay.status = "cancelled";
          return;
        }
        if (cloudbeds.status === "no_show") {
          if (!closed) publish<ReservationUpdated>("reservation.updated", cloudbeds.reservationID, occurred, [`reservation:${reservationId}`], { reservation_id: reservationId, changed_fields: ["status"], status: "no_show" }, timing(statusEvent("no_show")));
          stay.status = "no_show";
          return;
        }
        const update: ReservationUpdated["data"] = { reservation_id: reservationId, changed_fields: [] };
        if (status && status !== stay.status) Object.assign(update, { status }).changed_fields.push("status");
        if (plan.arrivalDate !== stay.arrivalDate) Object.assign(update, { planned_arrival_date: plan.arrivalDate }).changed_fields.push("planned_arrival_date");
        if (plan.departureDate !== stay.departureDate) Object.assign(update, { planned_departure_date: plan.departureDate }).changed_fields.push("planned_departure_date");
        if (guestId && guestId !== stay.guestId) Object.assign(update, guest).changed_fields.push("guest_id");
        const reported = event === "reservation/dates_changed" || event === "reservation/status_changed";
        if (update.changed_fields.length) publish<ReservationUpdated>("reservation.updated", cloudbeds.reservationID, occurred, [`reservation:${reservationId}`], update, timing(reported));
        if (plan.arrivalAt !== stay.arrivalAt || plan.departureAt !== stay.departureAt) expected(event !== "reservation/dates_changed");
        Object.assign(stay, plan, { guestId }, status ? { status } : {});
      }

      const roomId = cloudbeds.assigned?.[0]?.roomID;
      const unitId = roomId ? resolve("unit", roomId) : null;
      if (unitId && unitId !== stay.unitId) {
        publish<StayUnitAssigned>(
          "stay.unit_assigned",
          cloudbeds.reservationID,
          occurred,
          [`stay:${stayId}`, `unit:${unitId}`],
          { stay_id: stayId, unit_id: unitId, previous_unit_id: stay.unitId, ...(stay.unitId ? {} : { reason: "initial_assignment" }) },
          timing(event === "reservation/accommodation_changed" || event === "reservation/created"),
        );
        stay.unitId = unitId;
      } else if (!unitId && stay.unitId) {
        skip("The room was unassigned; HOS 0.1 has no event that removes an assignment.");
      }

      const unit = unitId ?? stay.unitId;
      if ((cloudbeds.status === "checked_in" || cloudbeds.status === "checked_out") && !stay.checkedIn && unit) {
        publish<StayCheckedIn>("stay.checked_in", cloudbeds.reservationID, occurred, [`stay:${stayId}`, `unit:${unit}`], { stay_id: stayId, unit_id: unit }, timing(statusEvent("checked_in")));
        stay.checkedIn = true;
      }
      if (cloudbeds.status === "checked_out" && stay.checkedIn && !stay.checkedOut && unit) {
        publish<StayCheckedOut>("stay.checked_out", cloudbeds.reservationID, occurred, [`stay:${stayId}`, `unit:${unit}`], { stay_id: stayId, unit_id: unit }, timing(statusEvent("checked_out")));
        stay.checkedOut = true;
      }
      if (events.length === published && !unmapped.length) skip("No change since the last fetch.");
    }

    function room(roomId: string, cloudbeds: CloudbedsRoomStatus) {
      const unitId = resolve("unit", roomId);
      const published = { ...units.get(roomId) };
      const next: Statuses = {};
      if (typeof cloudbeds.roomOccupied === "boolean") next.occupancy = cloudbeds.roomOccupied ? "occupied" : "vacant";
      if (cloudbeds.roomCondition && roomConditions[cloudbeds.roomCondition]) next.housekeeping = roomConditions[cloudbeds.roomCondition];
      // A blocked room cannot be booked; Cloudbeds does not say whether maintenance is the reason.
      if (cloudbeds.roomBlocked) next.commercial = "not_sellable";
      else if (published.commercial === "not_sellable") next.commercial = "sellable";

      const changed = dimensions.filter((dimension) => next[dimension] && next[dimension] !== published[dimension]);
      if (!changed.length) return skip("No status change.");
      const reported: Partial<Record<UnitStatusDimension, boolean>> = {
        housekeeping: event === "housekeeping/room_condition_changed",
        occupancy: event === "housekeeping/housekeeping_room_occupancy_status_changed",
      };
      for (const dimension of changed) {
        publish<UnitStatusChanged>(
          "unit.status_changed",
          `${roomId}/${dimension}`,
          occurred,
          [`unit:${unitId}`],
          { unit_id: unitId, dimension, ...(published[dimension] ? { previous: published[dimension] } : {}), current: next[dimension]!, authority_source: config.source },
          timing(Boolean(reported[dimension])),
        );
      }
      units.set(roomId, { ...published, ...next });
    }

    if (event.startsWith("reservation/")) {
      const fetched = delivery.reservation;
      if (fetched && fetched.reservationID === webhook.reservationID) reservation(fetched);
      else skip("Not returned by getReservation.");
    } else if (event.startsWith("housekeeping/")) {
      const roomId = webhook.roomID ?? webhook.roomId;
      const status = delivery.rooms?.find((item) => item.roomID === roomId);
      if (roomId && status) room(roomId, status);
      else skip("Room not returned by getHousekeepingStatus.");
    } else if (event.startsWith("guest/")) {
      skip("Guest profiles are personal data; HOS carries only a pseudonymous guest_id.");
    } else {
      skip("No HOS 0.1 counterpart in this mapping.");
    }
    return { events, unmapped };
  }

  return { handle };
}

// Replays a recording's Cloudbeds deliveries: each webhook with the reservation or housekeeping status fetched for it.
export function cloudbedsRecordingAdapter({ adapter }: MappingRecording): RecordingAdapter {
  const cloudbeds = createCloudbedsAdapter({ ...(adapter as unknown as Omit<CloudbedsAdapterConfig, "identities">), identities: createIdentityRegistry(adapter.crosswalk) });
  return (delivery) => {
    const fetched: Omit<CloudbedsDelivery, "received_at" | "webhook"> = {};
    for (const { operation, response } of delivery.fetched) {
      const { data } = response as { data: unknown };
      if (operation === "GET /getReservation") fetched.reservation = data as CloudbedsReservation;
      if (operation === "GET /getHousekeepingStatus") fetched.rooms = data as CloudbedsRoomStatus[];
    }
    return cloudbeds.handle({ received_at: delivery.received_at, webhook: delivery.webhook as CloudbedsWebhook, ...fetched });
  };
}

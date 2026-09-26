import {
  createFactWriter,
  createIdentityRegistry,
  type FactOptions,
  type IdentityRegistry,
  type ReservationCancelled,
  type ReservationCreated,
  type ReservationUpdated,
  type StayCheckedIn,
  type StayCheckedOut,
  type StayExpected,
  type StayUnitAssigned,
  type StayUnitUnassigned,
  type UnitMaintenanceCancelled,
  type UnitMaintenanceScheduled,
  type UnitStatusChanged,
  type UnitStatusDimension,
  utc,
  zonedTimeToUtc,
} from "@hos-ai/sdk";

import type { MappingRecording, MappingResult, RecordingAdapter, Unmapped } from "@/lib/hos/mappings/common";

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
  roomBlockID?: string;
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
  // One entry per booked room, assigned to a physical room or not yet.
  assigned?: Array<CloudbedsRoomLine & { roomID?: string; roomName?: string }>;
  unassigned?: CloudbedsRoomLine[];
};

export type CloudbedsRoomLine = { roomTypeID?: string; subReservationID?: string; startDate?: string; endDate?: string };

// One room of getHousekeepingStatus.
export type CloudbedsRoomStatus = {
  roomID?: string;
  roomName?: string;
  roomCondition?: string;
  roomOccupied?: boolean;
  roomBlocked?: boolean;
  date?: string;
};

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
// One block of getRoomBlocks. Its dates are days; eventID identifies each room's entry in the block.
export type CloudbedsRoomBlock = {
  roomBlockID: string;
  roomBlockType: "blocked_dates" | "out_of_service" | "courtesy_hold" | string;
  roomBlockReason?: string;
  startDate: string;
  endDate: string;
  rooms: Array<{ eventID: string; roomID: string; roomTypeID?: unknown; isSource?: boolean }>;
};

export type CloudbedsDelivery = {
  received_at: string;
  webhook: CloudbedsWebhook;
  reservation?: CloudbedsReservation;
  rooms?: CloudbedsRoomStatus[];
  roomBlocks?: CloudbedsRoomBlock[];
};

type PublishedStatus = "tentative" | "confirmed" | "cancelled" | "no_show";

// What HOS has been told about a reservation and each of its stays, one per booked room.
type PublishedReservation = {
  status: PublishedStatus;
  arrivalDate: string;
  departureDate: string;
  guestId?: string;
  stays: Map<string, PublishedStay>;
};
type PublishedStay = {
  arrivalAt: string;
  departureAt: string;
  unitId: string | null;
  assignedBefore: boolean;
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

// The day after a date, for block dates read as the last blocked night.
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function createCloudbedsAdapter(config: CloudbedsAdapterConfig) {
  const reservations = new Map<string, PublishedReservation>();
  const units = new Map<string, Statuses>();
  // What HOS has been told about each room block: per room entry, the unit and the plan last published.
  const blocks = new Map<string, Map<string, { unitId: string; plan: string }>>();
  const { resolve } = config.identities;

  function handle(delivery: CloudbedsDelivery): MappingResult {
    const { webhook } = delivery;
    const { event } = webhook;
    const entityId = webhook.reservationID ?? webhook.roomID ?? webhook.roomId ?? webhook.roomBlockID ?? "";
    const unmapped: Unmapped[] = [];
    const skip = (reason: string) => unmapped.push({ event, id: entityId, reason });

    // Cloudbeds spells the property id propertyID in reservation events and propertyId in others.
    const property = config.properties.find((candidate) => candidate.cloudbedsPropertyId === String(webhook.propertyID ?? webhook.propertyId ?? ""));
    if (!property) {
      skip("The property is not configured as a HOS property.");
      return { events: [], unmapped };
    }
    const { events, publish } = createFactWriter({
      source: config.source,
      tenant: config.tenant,
      propertyId: property.propertyId,
      timezone: property.timezone,
      recordedAt: delivery.received_at,
      idPrefix: "cloudbeds",
    });
    // Cloudbeds stamps each event with the moment it happened.
    const occurred = utc(Math.round(webhook.timestamp * 1000));
    // A fact the event itself reports occurred at the event's time, and its actor made it. One only noticed while
    // handling another event did not, so its time is when the adapter learned it.
    const kind = webhook.actor?.type;
    const actor =
      webhook.actor && (kind === "user" || kind === "guest" || kind === "system" || kind === "integration")
        ? `${kind}:${resolve("actor", webhook.actor.id)}`
        : undefined;
    const timing = (reportedBy: boolean): FactOptions => (reportedBy ? (actor ? { actor } : {}) : { timeBasis: "recorded" });

    function reservation(cloudbeds: CloudbedsReservation) {
      const before = events.length;
      const reservationId = resolve("reservation", cloudbeds.reservationID);
      const mainGuest = Object.values(cloudbeds.guestList ?? {}).find((guest) => guest.isMainGuest)?.guestID;
      const guestId = mainGuest ? resolve("guest", mainGuest) : undefined;
      const guest = guestId ? { guest_id: guestId } : {};
      const status = reservationStatuses[cloudbeds.status];
      const statusEvent = (value: string) => event === "reservation/status_changed" && webhook.status === value;
      let published = reservations.get(cloudbeds.reservationID);

      if (!published) {
        if (!status) return skip("Closed before HOS knew the reservation.");
        publish<ReservationCreated>(
          "reservation.created",
          cloudbeds.reservationID,
          occurred,
          [`reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])],
          {
            reservation_id: reservationId,
            status,
            planned_arrival_date: cloudbeds.startDate,
            planned_departure_date: cloudbeds.endDate,
            ...guest,
            external_refs: [
              { source_system: config.source, id_type: "reservation_id", source_id: cloudbeds.reservationID, verification: "verified" },
            ],
          },
          timing(event === "reservation/created"),
        );
        published = { status, arrivalDate: cloudbeds.startDate, departureDate: cloudbeds.endDate, guestId, stays: new Map() };
        reservations.set(cloudbeds.reservationID, published);
      } else {
        const closed = published.status === "cancelled" || published.status === "no_show";
        if (cloudbeds.status === "canceled") {
          // Cloudbeds reports no cancellation reason.
          if (!closed)
            publish<ReservationCancelled>(
              "reservation.cancelled",
              cloudbeds.reservationID,
              occurred,
              [`reservation:${reservationId}`],
              { reservation_id: reservationId },
              timing(statusEvent("canceled")),
            );
          published.status = "cancelled";
          return;
        }
        if (cloudbeds.status === "no_show") {
          if (!closed)
            publish<ReservationUpdated>(
              "reservation.updated",
              cloudbeds.reservationID,
              occurred,
              [`reservation:${reservationId}`],
              { reservation_id: reservationId, changed_fields: ["status"], status: "no_show" },
              timing(statusEvent("no_show")),
            );
          published.status = "no_show";
          return;
        }
        const update: ReservationUpdated["data"] = { reservation_id: reservationId, changed_fields: [] };
        if (status && status !== published.status) Object.assign(update, { status }).changed_fields.push("status");
        if (cloudbeds.startDate !== published.arrivalDate)
          Object.assign(update, { planned_arrival_date: cloudbeds.startDate }).changed_fields.push("planned_arrival_date");
        if (cloudbeds.endDate !== published.departureDate)
          Object.assign(update, { planned_departure_date: cloudbeds.endDate }).changed_fields.push("planned_departure_date");
        if (guestId && guestId !== published.guestId) Object.assign(update, guest).changed_fields.push("guest_id");
        const reported = event === "reservation/dates_changed" || event === "reservation/status_changed";
        if (update.changed_fields.length)
          publish<ReservationUpdated>(
            "reservation.updated",
            cloudbeds.reservationID,
            occurred,
            [`reservation:${reservationId}`],
            update,
            timing(reported),
          );
        Object.assign(published, { arrivalDate: cloudbeds.startDate, departureDate: cloudbeds.endDate, guestId }, status ? { status } : {});
      }

      // Each booked room is a stay of its own, as HOS Core allows.
      const lines = [...(cloudbeds.assigned ?? []), ...(cloudbeds.unassigned ?? [])];
      for (const line of lines) {
        const key = line.subReservationID ?? cloudbeds.reservationID;
        const stayId = resolve("stay", key);
        // Cloudbeds plans stays in days; the property's check-in and check-out times make them instants.
        const arrivalDate = line.startDate ?? cloudbeds.startDate;
        const plan = {
          arrivalAt: zonedTimeToUtc(arrivalDate, property!.checkInTime, property!.timezone),
          departureAt: zonedTimeToUtc(line.endDate ?? cloudbeds.endDate, property!.checkOutTime, property!.timezone),
        };
        let stay = published.stays.get(key);
        const expected = (options: FactOptions) =>
          publish<StayExpected>(
            "stay.expected",
            key,
            occurred,
            [`stay:${stayId}`, `reservation:${reservationId}`, ...(guestId ? [`guest:${guestId}`] : [])],
            { stay_id: stayId, reservation_id: reservationId, ...guest, planned_arrival_at: plan.arrivalAt, planned_departure_at: plan.departureAt },
            { businessDate: arrivalDate, ...options },
          );
        if (!stay) {
          // Cloudbeds has no separate expected-arrival moment: a committed reservation's rooms are expected stays.
          expected(timing(event === "reservation/created"));
          stay = { ...plan, unitId: null, assignedBefore: false, checkedIn: false, checkedOut: false };
          published.stays.set(key, stay);
        } else if (plan.arrivalAt !== stay.arrivalAt || plan.departureAt !== stay.departureAt) {
          expected(timing(event === "reservation/dates_changed"));
          Object.assign(stay, plan);
        }

        const roomId = (line as { roomID?: string }).roomID;
        const unitId = roomId ? resolve("unit", roomId) : null;
        const accommodation = timing(event === "reservation/accommodation_changed" || event === "reservation/created");
        if (unitId && unitId !== stay.unitId) {
          publish<StayUnitAssigned>(
            "stay.unit_assigned",
            key,
            occurred,
            [`stay:${stayId}`, `unit:${unitId}`],
            { stay_id: stayId, unit_id: unitId, previous_unit_id: stay.unitId, ...(stay.assignedBefore ? {} : { reason: "initial_assignment" }) },
            accommodation,
          );
          Object.assign(stay, { unitId, assignedBefore: true });
        } else if (!unitId && stay.unitId) {
          publish<StayUnitUnassigned>(
            "stay.unit_unassigned",
            key,
            occurred,
            [`stay:${stayId}`, `unit:${stay.unitId}`],
            { stay_id: stayId, unit_id: stay.unitId },
            accommodation,
          );
          stay.unitId = null;
        }

        if ((cloudbeds.status === "checked_in" || cloudbeds.status === "checked_out") && !stay.checkedIn && unitId) {
          publish<StayCheckedIn>(
            "stay.checked_in",
            key,
            occurred,
            [`stay:${stayId}`, `unit:${unitId}`],
            { stay_id: stayId, unit_id: unitId },
            timing(statusEvent("checked_in")),
          );
          stay.checkedIn = true;
        }
        if (cloudbeds.status === "checked_out" && stay.checkedIn && !stay.checkedOut && unitId) {
          publish<StayCheckedOut>(
            "stay.checked_out",
            key,
            occurred,
            [`stay:${stayId}`, `unit:${unitId}`],
            { stay_id: stayId, unit_id: unitId },
            timing(statusEvent("checked_out")),
          );
          stay.checkedOut = true;
        }
      }
      if (events.length === before && !unmapped.length) skip("No change since the last fetch.");
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
          {
            unit_id: unitId,
            dimension,
            ...(published[dimension] ? { previous: published[dimension] } : {}),
            current: next[dimension]!,
            authority_source: config.source,
          },
          timing(Boolean(reported[dimension])),
        );
      }
      units.set(roomId, { ...published, ...next });
    }

    // Each room of a block is a maintenance window of its own. A block holds a room as a stay would: from its first day at
    // the check-in time until the day after its last day at the check-out time.
    function roomBlock(blockId: string, cloudbeds: CloudbedsRoomBlock | undefined) {
      const published = blocks.get(blockId) ?? new Map<string, { unitId: string; plan: string }>();
      blocks.set(blockId, published);
      // A block the fetch misses is not withdrawn: only its removal event says so.
      if (!cloudbeds && event !== "roomblock/removed") return skip("Not returned by getRoomBlocks.");
      if (cloudbeds?.roomBlockType === "courtesy_hold") return skip("A courtesy hold is a commercial hold, not maintenance.");
      const current = event === "roomblock/removed" || !cloudbeds ? [] : cloudbeds.rooms;
      for (const { eventID, roomID } of current) {
        const unitId = resolve("unit", roomID);
        const window: UnitMaintenanceScheduled["data"] = {
          maintenance_id: resolve("maintenance", eventID),
          unit_id: unitId,
          starts_at: zonedTimeToUtc(cloudbeds!.startDate, property!.checkInTime, property!.timezone),
          ends_at: zonedTimeToUtc(nextDay(cloudbeds!.endDate), property!.checkOutTime, property!.timezone),
          // Cloudbeds's block reason is free text, which stays in Cloudbeds.
          statuses:
            cloudbeds!.roomBlockType === "out_of_service"
              ? { maintenance: "out_of_service", commercial: "not_sellable" }
              : { commercial: "not_sellable" },
        };
        const plan = JSON.stringify(window);
        if (published.get(eventID)?.plan === plan) continue;
        publish<UnitMaintenanceScheduled>("unit.maintenance_scheduled", eventID, occurred, [`unit:${unitId}`], window, timing(true));
        published.set(eventID, { unitId, plan });
      }
      // Rooms no longer in the block, or the whole block when it is removed, are withdrawn.
      for (const [eventID, { unitId }] of [...published]) {
        if (current.some((room) => room.eventID === eventID)) continue;
        publish<UnitMaintenanceCancelled>(
          "unit.maintenance_cancelled",
          eventID,
          occurred,
          [`unit:${unitId}`],
          { maintenance_id: resolve("maintenance", eventID), unit_id: unitId },
          timing(true),
        );
        published.delete(eventID);
      }
      if (!events.length) skip("No change since the last fetch.");
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
    } else if (event.startsWith("roomblock/")) {
      if (webhook.roomBlockID)
        roomBlock(
          webhook.roomBlockID,
          delivery.roomBlocks?.find((item) => item.roomBlockID === webhook.roomBlockID),
        );
      else skip("No room block id in the webhook.");
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
  const cloudbeds = createCloudbedsAdapter({
    ...(adapter as unknown as Omit<CloudbedsAdapterConfig, "identities">),
    identities: createIdentityRegistry(adapter.crosswalk),
  });
  return (delivery) => {
    const fetched: Omit<CloudbedsDelivery, "received_at" | "webhook"> = {};
    for (const { operation, response } of delivery.fetched) {
      const { data } = response as { data: unknown };
      if (operation === "GET /getReservation") fetched.reservation = data as CloudbedsReservation;
      if (operation === "GET /getHousekeepingStatus") fetched.rooms = data as CloudbedsRoomStatus[];
      if (operation === "GET /getRoomBlocks") fetched.roomBlocks = (data as { roomBlocks: CloudbedsRoomBlock[] }).roomBlocks;
    }
    return cloudbeds.handle({ received_at: delivery.received_at, webhook: delivery.webhook as CloudbedsWebhook, ...fetched });
  };
}

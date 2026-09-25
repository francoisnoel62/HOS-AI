import type { PmsMapping } from "@/lib/hos/mappings/replay";

// Copy for the experimental PMS mapping pages. Each row of mapping is [PMS event, when, HOS Events 0.1, how]; each
// finding is [title, text].

export type PmsMappingCopy = {
  name: string;
  api: string;
  title: string;
  description: string;
  // Labels a recorded webhook in the replay, such as its event name.
  eventLabel: (webhook: never) => string;
  mapping: string[][];
  findings: string[][];
};

export const pmsMappingCopy: Record<PmsMapping, PmsMappingCopy> = {
  mews: {
    name: "Mews",
    api: "Mews Connector API",
    title: "The same early arrival, with the PMS speaking Mews.",
    description: "Webhook messages that carry only ids, then the reservation and room the integration fetches.",
    eventLabel: (webhook: { Events: Array<{ Discriminator: string }> }) => webhook.Events.map((event) => event.Discriminator).join(", "),
    mapping: [
      ["ServiceOrderUpdated", "First seen Optional or Confirmed", "reservation.created, stay.expected", "time is CreatedUtc. The confirmation Number and the reservation Id become typed external references; AccountId becomes a pseudonymous guest_id through the crosswalk."],
      ["ServiceOrderUpdated", "Inquired or Requested", "Nothing yet", "Not a commitment: published once the reservation becomes Optional or Confirmed."],
      ["ServiceOrderUpdated", "State, schedule or owner changed", "reservation.updated, stay.expected", "Only the changed fields travel, at UpdatedUtc with hostimebasis modified. The stay is announced again when its planned times move."],
      ["ServiceOrderUpdated", "AssignedResourceId set or changed", "stay.unit_assigned", "previous_unit_id is the unit already published; the reason is known only for the first assignment. At UpdatedUtc, hostimebasis modified."],
      ["ServiceOrderUpdated", "AssignedResourceId removed", "stay.unit_unassigned", "The released unit, at UpdatedUtc, hostimebasis modified."],
      ["ServiceOrderUpdated", "Started", "stay.checked_in", "time is ActualStartUtc, the actual arrival."],
      ["ServiceOrderUpdated", "Processed", "stay.checked_out", "time is ActualEndUtc. A check-in the adapter missed is published first."],
      ["ServiceOrderUpdated", "Canceled", "reservation.cancelled, or reservation.updated", "CancellationReason NoShow becomes status no_show; the other reasons map to guest_request, property_request, payment_issue or other."],
      ["ResourceUpdated", "Dirty, Clean, Inspected", "unit.status_changed · housekeeping", "At UpdatedUtc, hostimebasis modified; previous only when the adapter saw it. The manifest, not the adapter, decides whether the PMS is authoritative."],
      ["ResourceUpdated", "OutOfService, OutOfOrder", "unit.status_changed · maintenance", "out_of_service; leaving it publishes operational, then the housekeeping state."],
      ["ResourceBlockUpdated", "OutOfOrder, InternalUse block", "unit.maintenance_scheduled", "StartUtc and EndUtc. OutOfOrder: out_of_service and not_sellable; InternalUse: not_sellable, reason internal_use. The block's name and notes stay in Mews."],
      ["ResourceBlockUpdated", "Block deleted", "unit.maintenance_cancelled", "At DeletedUtc."],
      ["Other events", "CustomerAdded, CustomerUpdated, MessageAdded, PaymentUpdated", "Not mapped", "Profiles stay in Mews; an arrival signal must be extracted from a message; payments have no HOS 0.1 counterpart."],
    ],
    findings: [
      ["Webhooks say what changed, not how.", "Mews sends entity ids only. The adapter fetches each entity and compares it with what it already published, so its memory is part of the integration and must be persisted."],
      ["A stay has no expected moment in Mews.", "The stay is published with the reservation, at CreatedUtc. HOS Events now says so: stay.expected is due as soon as the stay is committed, with the arrival day as its business date."],
      ["Removing an assignment needed an event.", "stay.unit_assigned requires a unit, and Mews can unassign one. HOS 0.1 now has stay.unit_unassigned."],
      ["One Mews state, four HOS dimensions.", "OutOfOrder replaces the housekeeping state in Mews. HOS keeps both dimensions; the source simply stops reporting one of them."],
      ["Occurrence times are approximate.", "Assignments and room states only carry the entity's last update, UpdatedUtc: an upper bound when several changes arrive in one fetch. HOS 0.1 now says so with hostimebasis modified."],
      ["Provenance stops at the PMS.", "Mews does not say who changed a room state, why, what it was before or what caused it. The manifest's authority rule is what keeps a mirrored status from overriding the housekeeping system."],
      ["Blocks are more than repairs.", "A Mews block is out of order or for internal use. HOS maintenance windows keep both and say which statuses they impose: out of service, out of sale, or both."],
      ["Tasks are out of reach.", "There is no task webhook, and a Mews task points to a reservation, not a room. This integration publishes no housekeeping tasks."],
    ],
  },
  apaleo: {
    name: "Apaleo",
    api: "Apaleo API",
    title: "The same early arrival, with the PMS speaking Apaleo.",
    description: "Webhooks that name what happened and when, then the reservation or unit the integration fetches.",
    eventLabel: (webhook: { topic: string; type: string }) => `${webhook.topic}/${webhook.type}`,
    mapping: [
      ["Reservation/created", "Confirmed", "reservation.created, stay.expected", "time is the reservation's created time. The reservation and booking ids become typed external references. No guest_id: Apaleo embeds guest details without a guest id."],
      ["Reservation/amended, changed", "Arrival or departure moved", "reservation.updated, stay.expected", "Only the changed fields travel, at the event's timestamp."],
      ["Reservation/unit-assigned", "A unit is assigned", "stay.unit_assigned", "time is the event's timestamp; previous_unit_id is the unit already published. Seen through another event, at modified with hostimebasis modified."],
      ["Reservation/checked-in, checked-out", "InHouse, CheckedOut", "stay.checked_in, stay.checked_out", "time is checkInTime or checkOutTime."],
      ["Reservation/canceled, set-to-no-show", "Canceled, NoShow", "reservation.cancelled, reservation.updated", "At cancellationTime or noShowTime; no-show becomes status no_show. No cancellation reason is mapped."],
      ["Reservation/unit-unassigned", "The unit is released", "stay.unit_unassigned", "At the event's timestamp."],
      ["Reservation/check-in-reverted", "Back to Confirmed", "stay.check_in_reverted", "At the event's timestamp; the stay is expected again."],
      ["Unit/changed", "isOccupied", "unit.status_changed · occupancy", "occupied or vacant, at the event's timestamp."],
      ["Unit/changed", "condition", "unit.status_changed · housekeeping", "Dirty → dirty; CleanToBeInspected → clean; Clean → inspected where the property inspects, clean otherwise."],
      ["Unit/changed", "maintenance", "unit.status_changed · maintenance, commercial", "Any maintenance → out_of_service; OutOfOrder and OutOfInventory also → not_sellable."],
      ["Maintenance/created, changed", "OutOfService, OutOfOrder, OutOfInventory", "unit.maintenance_scheduled", "from and to, at the event's timestamp. OutOfService: out_of_service, reason repair; OutOfOrder: also not_sellable; OutOfInventory: both, reason renovation. The description stays in Apaleo."],
      ["Maintenance/deleted", "The maintenance is gone", "unit.maintenance_cancelled", "For the unit the adapter published, since a deleted maintenance can no longer be fetched."],
      ["Other topics", "Folio, invoice, rate plan, block, company…", "Not mapped", "No HOS 0.1 counterpart yet."],
    ],
    findings: [
      ["Events say what happened, and when.", "Apaleo names each change, such as unit-assigned or checked-in, and stamps it. Assignments get exact times, where Mews only gives the reservation's last update."],
      ["There is no guest identity to link.", "An Apaleo reservation embeds its guest's details without an id, so HOS gets no guest_id. HOS 0.1 now states the rule: without a stable guest identity, no guest_id, and never one derived from names or contact details."],
      ["Rooms already look like HOS.", "Occupancy, cleanliness and maintenance are separate in Apaleo, as in HOS, and its maintenance types even say whether the unit can still be sold."],
      ["A status name is not its meaning.", "Clean means inspected only where the property inspects. The adapter takes that workflow from its configuration."],
      ["Undo needed events of its own.", "Apaleo can unassign a unit and revert a check-in. HOS 0.1 now has stay.unit_unassigned and stay.check_in_reverted."],
      ["A deletion carries no data.", "Once deleted, a maintenance can no longer be fetched. The adapter's memory of what it published is what names the unit to free."],
      ["Tasks are out of reach.", "Apaleo's webhook events include no housekeeping task. This integration publishes none."],
    ],
  },
  cloudbeds: {
    name: "Cloudbeds",
    api: "Cloudbeds API v1.3",
    title: "The same early arrival, with the PMS speaking Cloudbeds.",
    description: "Webhooks that name what happened and when, then the reservation or housekeeping status the integration fetches.",
    eventLabel: (webhook: { event: string }) => webhook.event,
    mapping: [
      ["reservation/created", "confirmed, not_confirmed", "reservation.created, stay.expected", "time is the webhook timestamp. One stay per booked room. The main guest's id becomes a pseudonymous guest_id; the planned check-in combines the room's startDate with the property's standard check-in time."],
      ["reservation/status_changed", "confirmed", "reservation.updated", "status confirmed, at the webhook timestamp."],
      ["reservation/status_changed", "checked_in, checked_out", "stay.checked_in, stay.checked_out", "At the webhook timestamp. The webhook's actor becomes a pseudonymous hosactor."],
      ["reservation/status_changed", "canceled, no_show", "reservation.cancelled, reservation.updated", "Cloudbeds gives no cancellation reason; no-show becomes status no_show."],
      ["reservation/dates_changed", "Dates moved", "reservation.updated, stay.expected", "Only the changed fields travel."],
      ["reservation/accommodation_changed", "A room is assigned or released", "stay.unit_assigned, stay.unit_unassigned", "The room comes from getReservation; time is the webhook timestamp."],
      ["housekeeping/room_condition_changed", "dirty, clean, inspected", "unit.status_changed · housekeeping", "The same three conditions as HOS, read from getHousekeepingStatus."],
      ["housekeeping/*", "roomOccupied", "unit.status_changed · occupancy", "Dated when the occupancy event reports it; otherwise hostimebasis is recorded."],
      ["housekeeping/*", "roomBlocked", "unit.status_changed · commercial", "A blocked room is not sellable; Cloudbeds does not say whether maintenance is why."],
      ["roomblock/created, details_changed", "out_of_service, blocked_dates", "unit.maintenance_scheduled", "One window per room of the block. Its days become instants like a stay's: from the first day's check-in time to the check-out time after the last day. out_of_service: out_of_service and not_sellable; blocked_dates: not_sellable."],
      ["roomblock/removed, or a room left the block", "—", "unit.maintenance_cancelled", "At the webhook timestamp. Courtesy holds are commercial holds, not maintenance, and are left out."],
      ["Other events", "guest/*, accounting, notes, custom fields…", "Not mapped", "Guest profiles are personal data and stay in Cloudbeds; the others have no HOS 0.1 counterpart yet."],
    ],
    findings: [
      ["Stays are planned in days.", "startDate and endDate have no time. HOS Core now gives the Property standard check-in and check-out times, which getHotelDetails reports, to make them instants."],
      ["Events are precise; fetches are not always.", "A webhook timestamp dates what its event reports. A fact only noticed in a fetch, such as occupancy during a condition change, gets hostimebasis recorded: HOS 0.1 already had the right tool."],
      ["Housekeeping already speaks HOS.", "Cloudbeds has the same three room conditions as HOS, inspected included."],
      ["Who did it now has a place.", "Status webhooks name the user who acted. HOS 0.1 now carries it as hosactor, a pseudonymous reference such as user:staff_r7."],
      ["One reservation, several rooms.", "A Cloudbeds reservation can hold several rooms. Each room is now a stay of its own, as HOS Core allows, with its own dates and unit."],
      ["Payload spelling varies.", "Reservation events say propertyID, guest events propertyId. The adapter accepts both, and the recording marks the two payloads it had to reconstruct."],
      ["A block's last day is an assumption.", "Block dates are days. The adapter reads endDate as the last blocked night, as getRoomBlocks' filter on blocks that include a date suggests; a live property must confirm it."],
      ["Tasks are out of reach.", "Cloudbeds assigns housekeepers to rooms rather than publishing tasks. This integration publishes no tasks."],
    ],
  },
};

// How the three APIs compare on what mattered for the arrival scenario: [question, Mews, Apaleo, Cloudbeds].
export const pmsComparison = [
  ["What a webhook says", "Entity ids only", "Event name, entity id, timestamp", "Event name, entity id, timestamp, some fields"],
  ["When a room was assigned", "The reservation's last update", "Exactly, from the event", "Exactly, from the event"],
  ["Guest identity", "Customer id, as a pseudonymous guest_id", "None: guest details embedded", "Main guest id, as a pseudonymous guest_id"],
  ["Room state", "One state for cleanliness and maintenance", "Occupancy, condition and maintenance apart", "Condition, occupancy and blocking apart"],
  ["Planned arrival", "Date and time", "Date and time", "Day only, plus the property's check-in time"],
  ["What HOS 0.1 gained from it", "stay.unit_unassigned, hostimebasis modified, maintenance windows", "stay.unit_unassigned, stay.check_in_reverted, the guest identity rule, maintenance windows", "stay.unit_unassigned, hosactor, standard check-in and check-out times, maintenance windows"],
  ["Scheduled maintenance", "Resource blocks: out of order or internal use", "Maintenances: out of service, out of order or out of inventory", "Room blocks in days, for several rooms; courtesy holds left out"],
  ["Housekeeping tasks", "No webhook", "No webhook", "Housekeeper assignments, no tasks"],
];

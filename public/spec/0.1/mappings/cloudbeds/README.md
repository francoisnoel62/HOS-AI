# Cloudbeds API v1.3 → HOS Events 0.1 — experimental mapping

Status: **experimental and unofficial**. HOS AI is not affiliated with Cloudbeds, and Cloudbeds has not reviewed or endorsed this mapping. Every payload is synthetic, and **two webhook payloads are reconstructed**. The adapter has not yet run against a live Cloudbeds property.

The mapping covers the facts the arrival-readiness scenario needs from a PMS: reservations, stays, room assignment, check-in and check-out, and room status. It is written from these sources:

| Source                                                                                                                                               | By Cloudbeds | What it covers                                                                                                                                                                                                                     |
| :--------------------------------------------------------------------------------------------------------------------------------------------------- | :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Official Python SDK, API v1.3](https://github.com/cloudbeds/cloudbeds-api-python/tree/release/v1) (`cloudbeds-pms-v1-3` 1.18.0, revision `abbc43b`) | Yes          | Generated from Cloudbeds's OpenAPI description. It gives the `getReservation`, `getHousekeepingStatus`, `getRoomBlocks` and `getHotelDetails` responses, the reservation statuses, and webhook subscriptions by object and action. |
| [`@pipedream/cloudbeds`](https://www.npmjs.com/package/@pipedream/cloudbeds) 0.1.0                                                                   | No           | Sample `reservation/created` and `reservation/status_changed` webhook payloads.                                                                                                                                                    |
| [`n8n-nodes-cloudbeds`](https://www.npmjs.com/package/n8n-nodes-cloudbeds) 0.3.30                                                                    | No           | Webhook event names, including `reservation/accommodation_changed`, `housekeeping/room_condition_changed` and `roomblock/*`.                                                                                                       |
| [Webhooks guide](https://developers.cloudbeds.com/docs/webhooks-1)                                                                                   | Yes          | Read through search excerpts only: the site was not reachable from the build environment. It names `roomID` and `old_roomID` for accommodation changes.                                                                            |

### Reconstructed payloads

No published sample of `reservation/accommodation_changed` or `housekeeping/room_condition_changed` was reachable. Deliveries B and C use these events, with fields that follow the published reservation samples, plus the room id. Each one says so in `webhook_verification`. The adapter depends on them as little as it can:

- From `reservation/accommodation_changed`, it reads only `reservationID`, `propertyID` and `timestamp`. The room comes from `getReservation`.
- From `housekeeping/room_condition_changed`, it reads only the property id, the room id and `timestamp`, in either spelling Cloudbeds uses. The condition comes from `getHousekeepingStatus`.

### Room block dates

Block dates are days. A window holds its room as a stay would: from the first day at the standard check-in time to the day after the last day at the standard check-out time. That reading takes `endDate` as the last blocked night, as `getRoomBlocks`' filter on "blocks that include this date" suggests. It is not yet confirmed on a live property. No published sample of the `roomblock/*` webhooks was reachable either: the adapter reads only `roomBlockID`, the property id and the timestamp from them, and fetches the block.

## Contents

- `arrival-readiness.json` holds the PMS deliveries of the [arrival-readiness scenario](../../conformance/arrival-readiness/scenario.json), recorded as Cloudbeds would send them. Each delivery has a webhook plus the `getReservation` or `getHousekeepingStatus` response an integration fetches for it. The file also carries the adapter configuration, the id crosswalk, every documented difference from the synthetic corpus, and the fact Cloudbeds adds.
- The reference adapter is `lib/hos/mappings/cloudbeds.ts` in the repository. `lib/hos/mappings/replay.ts` rebuilds the scenario with it.
- `tests/unit/pms-mappings.test.ts` checks three things:
  - every mapped fact is a valid HOS event;
  - the mapped facts equal the corpus PMS facts, except for the documented differences;
  - the replay reaches the scenario's `expected.json`, with the adapter's event ids in place of the corpus ids.

`tests/unit/cloudbeds-adapter.test.ts` covers the adapter's behaviour beyond the scenario. The live replay is at `/demo/cloudbeds` on the HOS AI website.

## How the adapter works

A Cloudbeds webhook names the event, such as `reservation/status_changed`, and carries the entity id and a Unix timestamp. The integration fetches the reservation or the housekeeping status. The adapter compares it with what it has already published to HOS, and emits only the facts that changed. Cloudbeds payloads and guest profiles are never forwarded.

- **Identities.** HOS ids come from a crosswalk kept by the integration. They are never the Cloudbeds ids, so they survive a PMS migration. Each booked room, identified by its `subReservationID`, is a stay of its own. The main guest's `guestID` becomes a pseudonymous `guest_id`, and the webhook's `actor` a pseudonymous `hosactor`.
- **Event ids.** Each id is derived from the Cloudbeds entity id, the HOS type and the webhook timestamp. A redelivered webhook, or a restarted adapter, therefore publishes the same id, and HOS discards the duplicate.
- **Times.** A fact the webhook reports is dated by its timestamp, to the millisecond. A fact only noticed in a fetch is not dated by Cloudbeds. Its `time` is when the adapter recorded it, with `hostimebasis` `recorded`. For example, occupancy seen during a condition change.
- **Planned arrival.** A room's `startDate` and `endDate` are days. The adapter adds the Property's standard check-in and check-out times, which `getHotelDetails` reports in `propertyPolicy`, to get instants in the property time zone.
- **Authority.** The adapter publishes as the property's PMS producer. The producer manifest decides what HOS treats as authoritative. At the demo property, the PMS only mirrors housekeeping status, but it is the authority for occupancy and saleability.

## Field mapping

| Cloudbeds                                                | HOS Events 0.1                               | Notes                                                                                                                                                                                      |
| :------------------------------------------------------- | :------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservation/created`                                    | `reservation.created` + `stay.expected`      | `confirmed` → `confirmed`; `not_confirmed` → `tentative`. Planned dates are `startDate` / `endDate`.                                                                                       |
| `reservationID`                                          | `external_refs`                              | `reservation_id`, `verified`, issued by the PMS producer.                                                                                                                                  |
| Main guest in `guestList`                                | `guest_id`                                   | Pseudonymous, through the crosswalk. Names, emails and documents stay in Cloudbeds.                                                                                                        |
| `reservation/status_changed` `confirmed`                 | `reservation.updated`                        | `status` = `confirmed`.                                                                                                                                                                    |
| `reservation/dates_changed`                              | `reservation.updated` + `stay.expected`      | Only the changed dates.                                                                                                                                                                    |
| `reservation/accommodation_changed`                      | `stay.unit_assigned`, `stay.unit_unassigned` | The room is `assigned[].roomID` from `getReservation`. `reason` is `initial_assignment` for the first room. A room back in `unassigned` is released.                                       |
| `reservation/status_changed` `checked_in`, `checked_out` | `stay.checked_in`, `stay.checked_out`        | The webhook's `actor` becomes `hosactor`, for example `user:staff_r7`.                                                                                                                     |
| `reservation/status_changed` `canceled`                  | `reservation.cancelled`                      | Cloudbeds reports no cancellation reason.                                                                                                                                                  |
| `reservation/status_changed` `no_show`                   | `reservation.updated`                        | `status` = `no_show`.                                                                                                                                                                      |
| `roomCondition`                                          | `unit.status_changed`, `housekeeping`        | `dirty`, `clean` and `inspected`, as in HOS.                                                                                                                                               |
| `roomOccupied`                                           | `unit.status_changed`, `occupancy`           | `occupied` / `vacant`.                                                                                                                                                                     |
| `roomBlocked`                                            | `unit.status_changed`, `commercial`          | A blocked room is `not_sellable`. Cloudbeds does not say whether maintenance is the reason.                                                                                                |
| `roomblock/created`, `roomblock/details_changed`         | `unit.maintenance_scheduled`                 | One window per room entry (`eventID`) of `getRoomBlocks`. `out_of_service`: `out_of_service` and `not_sellable`; `blocked_dates`: `not_sellable`. The free-text reason stays in Cloudbeds. |
| `roomblock/removed`, or a room gone from the block       | `unit.maintenance_cancelled`                 | At the webhook timestamp. A block the fetch misses is not withdrawn.                                                                                                                       |
| `courtesy_hold` block                                    | —                                            | A commercial hold, not maintenance.                                                                                                                                                        |
| `guest/*`                                                | —                                            | Guest profiles are personal data and stay in Cloudbeds.                                                                                                                                    |
| Other events: accounting, notes, custom fields…          | —                                            | No HOS 0.1 counterpart in this mapping.                                                                                                                                                    |

A reservation with several rooms yields one stay per room, each with its own dates and unit.

## Differences from the synthetic corpus

The Cloudbeds replay has 13 facts:

- **Delivery 7 is not reproduced.** Cloudbeds assigns housekeepers to rooms rather than publishing tasks.
- **One fact is added.** Room 204 is `vacant`, from `getHousekeepingStatus`. The condition event does not date it, so `hostimebasis` is `recorded`. The PMS is the declared occupancy authority; readiness does not depend on it.
- **Delivery 1:** `external_refs` carry the Cloudbeds reservation id.
- **Delivery 2:** `stay.expected` is published with the reservation, not on the arrival morning.
- **Delivery 9:** there is no `previous`, `reason` or causation.
- **Delivery 13:** `hosactor` names the user who checked the guest in.

The dispositions, readiness and situations are the same as in the scenario's `expected.json`.

## What the mapping taught us about HOS 0.1

1. **Stays are planned in days.** HOS Core now gives the Property standard check-in and check-out times to make them instants.
2. **Events are precise; fetches are not always.** `hostimebasis` `recorded` already covers what a fetch cannot date.
3. **Housekeeping already speaks HOS.** Cloudbeds has the same three room conditions, `inspected` included.
4. **Who did it now has a place.** Status webhooks name the actor; HOS 0.1 now carries it as `hosactor`.
5. **One reservation, several rooms.** Each room is a stay of its own, as HOS Core allows.
6. **Payload spelling varies.** Reservation events say `propertyID`, guest events `propertyId`.
7. **Tasks are out of reach.** This integration publishes no tasks.

## Not covered yet

- The estimated arrival time on the reservation, a structured arrival signal HOS does not map yet.
- API keys or OAuth, rate limits and webhook subscription management in a live integration.
- Persistence of the crosswalk and of the adapter's published state.

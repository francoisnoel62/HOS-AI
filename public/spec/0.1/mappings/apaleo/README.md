# Apaleo API → HOS Events 0.1 — experimental mapping

Status: **experimental and unofficial**. HOS AI is not affiliated with Apaleo, and Apaleo has not reviewed or endorsed this mapping. Every payload is synthetic. The adapter has not yet run against a live Apaleo account.

The mapping covers the facts the arrival-readiness scenario needs from a PMS: reservations, stays, unit assignment, check-in and check-out, and unit status. It is written from these sources:

| Source                                                                                                               | By Apaleo | What it covers                                                                                                                                                                                                                         |
| :------------------------------------------------------------------------------------------------------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@apaleo/n8n-nodes-apaleo-official`](https://www.npmjs.com/package/@apaleo/n8n-nodes-apaleo-official) 1.0.37        | Yes       | The webhook events an integration can subscribe to, such as `reservation/unit-assigned`, `reservation/checked-in` and `unit/changed`.                                                                                                  |
| [`@apaleo/angular-api-proxy-booking`](https://www.npmjs.com/package/@apaleo/angular-api-proxy-booking) 19.0.29       | Yes       | `ReservationModel`. The typings are generated from the evolving Booking API; the fields used here are those of v1.                                                                                                                     |
| [`@apaleo/angular-api-proxy-inventory`](https://www.npmjs.com/package/@apaleo/angular-api-proxy-inventory) 19.0.29   | Yes       | `UnitModel`: occupancy, condition and maintenance.                                                                                                                                                                                     |
| [`@apaleo/angular-api-proxy-operations`](https://www.npmjs.com/package/@apaleo/angular-api-proxy-operations) 19.0.29 | Yes       | `MaintenanceModel`: unit, `from`, `to` and type. The typings are generated from the evolving Operations API; the adapter fetches `GET /operations/v1/maintenances/{id}`.                                                               |
| [Webhook payload guide](https://apaleo.dev/guides/webhook/webhooks-payload.html)                                     | Yes       | The webhook message: `topic`, `type`, `id`, `accountId`, `propertyId`, `timestamp` in milliseconds, `clientId`, `subjectId` and `data.entityId`. Read through a search excerpt: the site was not reachable from the build environment. |

## Contents

- `arrival-readiness.json` holds the PMS deliveries of the [arrival-readiness scenario](../../conformance/arrival-readiness/scenario.json), recorded as Apaleo would send them. Each delivery has a webhook plus the reservation or unit an integration fetches for it. The file also carries the adapter configuration, the id crosswalk, every documented difference from the synthetic corpus, and the fact Apaleo adds.
- The reference adapter is `lib/hos/mappings/apaleo.ts` in the repository. `lib/hos/mappings/replay.ts` rebuilds the scenario with it.
- `tests/unit/pms-mappings.test.ts` checks three things:
  - every mapped fact is a valid HOS event;
  - the mapped facts equal the corpus PMS facts, except for the documented differences;
  - the replay reaches the scenario's `expected.json`, with the adapter's event ids in place of the corpus ids.

`tests/unit/apaleo-adapter.test.ts` covers the adapter's behaviour beyond the scenario. The live replay is at `/demo/apaleo` on the HOS AI website.

## How the adapter works

An Apaleo webhook names the event, such as `Reservation` / `unit-assigned`, and carries the entity id and a timestamp. The integration fetches the reservation (`GET /booking/v1/reservations/{id}`) or the unit (`GET /inventory/v1/units/{id}`). The adapter compares it with what it has already published to HOS, and emits only the facts that changed. Apaleo payloads and guest details are never forwarded.

- **Identities.** HOS ids come from a crosswalk kept by the integration. They are never the Apaleo ids, so they survive a PMS migration. An entity the crosswalk does not know gets a fresh opaque id.
- **Event ids.** Each id is derived from the Apaleo entity id, the HOS type and Apaleo's own time for the change. A redelivered webhook, or a restarted adapter, therefore publishes the same id, and HOS discards the duplicate.
- **Times.** The event's `timestamp` for assignments and unit changes. The reservation's own `created`, `checkInTime`, `checkOutTime`, `cancellationTime` and `noShowTime` for those facts.
- **Authority.** The adapter publishes as the property's PMS producer. The producer manifest decides what HOS treats as authoritative. At the demo property, the PMS only mirrors housekeeping status, but it is the authority for occupancy.
- **Inspections.** The property configuration says whether the property inspects. It decides what `Clean` means.

## Field mapping

| Apaleo                                                   | HOS Events 0.1                                        | Notes                                                                                                                                                                                                                                     |
| :------------------------------------------------------- | :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reservation first seen, not `Canceled` or `NoShow`       | `reservation.created` + `stay.expected`               | `time` = `created`. `status` = `confirmed`. Planned dates are the local dates of `arrival` / `departure`.                                                                                                                                 |
| `id`, `bookingId`                                        | `external_refs`                                       | `reservation_id` and `booking_id`, `verified`, issued by the PMS producer.                                                                                                                                                                |
| `primaryGuest`, `additionalGuests`, `booker`             | —                                                     | Personal data without an id. As HOS 0.1 requires, no `guest_id` is published, and none is derived from names or contact details.                                                                                                          |
| `arrival` or `departure` moved                           | `reservation.updated` + `stay.expected`               | Only the changed dates, at the event's timestamp.                                                                                                                                                                                         |
| `reservation/unit-assigned`, or `unit` changed           | `stay.unit_assigned`                                  | At the event's timestamp for `unit-assigned`; at `modified`, with `hostimebasis` = `modified`, otherwise. `reason` is `initial_assignment` for the first unit.                                                                            |
| `reservation/unit-unassigned`, or `unit` removed         | `stay.unit_unassigned`                                | At the event's timestamp for `unit-unassigned`; at `modified`, with `hostimebasis` = `modified`, otherwise.                                                                                                                               |
| `status` `InHouse`                                       | `stay.checked_in`                                     | `time` = `checkInTime`.                                                                                                                                                                                                                   |
| `reservation/check-in-reverted`                          | `stay.check_in_reverted`                              | At the event's timestamp. The stay is expected again, and a later check-in is published anew.                                                                                                                                             |
| `status` `CheckedOut`                                    | `stay.checked_out`                                    | `time` = `checkOutTime`.                                                                                                                                                                                                                  |
| `status` `Canceled`                                      | `reservation.cancelled`                               | `time` = `cancellationTime`. No reason is mapped.                                                                                                                                                                                         |
| `status` `NoShow`                                        | `reservation.updated`                                 | `status` = `no_show`, at `noShowTime`.                                                                                                                                                                                                    |
| Unit `status.isOccupied`                                 | `unit.status_changed`, `occupancy`                    | `occupied` / `vacant`.                                                                                                                                                                                                                    |
| Unit `status.condition`                                  | `unit.status_changed`, `housekeeping`                 | `Dirty` → `dirty`; `CleanToBeInspected` → `clean`; `Clean` → `inspected` where the property inspects, `clean` otherwise.                                                                                                                  |
| Unit `status.maintenance`                                | `unit.status_changed`, `maintenance` and `commercial` | Any maintenance → `out_of_service`. `OutOfOrder` and `OutOfInventory` also → `not_sellable`. Leaving it publishes `operational` and `sellable`.                                                                                           |
| `maintenance/created`, `maintenance/changed`             | `unit.maintenance_scheduled`                          | `starts_at` = `from`, `ends_at` = `to`, at the event's timestamp. `OutOfService`: `out_of_service`, `reason` `repair`; `OutOfOrder`: also `not_sellable`; `OutOfInventory`: both, `reason` `renovation`. The description stays in Apaleo. |
| `maintenance/deleted`                                    | `unit.maintenance_cancelled`                          | For the unit the adapter published: a deleted maintenance can no longer be fetched.                                                                                                                                                       |
| Other topics: folio, invoice, rate plan, block, company… | —                                                     | No HOS 0.1 counterpart in this mapping.                                                                                                                                                                                                   |

Only `BedRoom` unit groups become stays and units; Apaleo also rents parking lots, meeting rooms and event spaces.

## Differences from the synthetic corpus

The Apaleo replay has 13 facts:

- **Delivery 7 is not reproduced.** Apaleo's webhook events include no housekeeping task.
- **One fact is added.** Room 204 is `vacant`: Apaleo reports occupancy with every unit, and the PMS is the declared occupancy authority. Readiness does not depend on it.
- **Deliveries 1 and 2:** there is no `guest_id` and no guest subject. `external_refs` carry the Apaleo reservation and booking ids. `stay.expected` is published with the reservation, not on the arrival morning.
- **Delivery 9:** there is no `previous`, `reason` or causation.

The dispositions, readiness and situations are the same as in the scenario's `expected.json`.

## What the mapping taught us about HOS 0.1

1. **Events say what happened, and when.** Assignments get exact times, where Mews only gives the reservation's last update.
2. **There is no guest identity to link.** HOS 0.1 now states the rule: without a stable guest identity, no `guest_id`, and never one derived from names or contact details. Linking stays to a guest needs an identity service.
3. **Rooms already look like HOS.** Occupancy, cleanliness and maintenance are separate in Apaleo, as in HOS.
4. **A status name is not its meaning.** `Clean` means inspected only where the property inspects.
5. **Undo needed events of its own.** HOS 0.1 now has `stay.unit_unassigned` and `stay.check_in_reverted`.
6. **Tasks are out of reach.** This integration publishes no housekeeping tasks.

## Not covered yet

- Multi-unit bookings, blocks and groups.
- Access tokens, rate limits and webhook subscription management in a live integration.
- Persistence of the crosswalk and of the adapter's published state.

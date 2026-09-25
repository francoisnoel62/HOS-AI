# Mews Connector API → HOS Events 0.1 — experimental mapping

Status: **experimental and unofficial**. It is written from Mews's public Connector API documentation ([MewsSystems/gitbook-connector-api](https://github.com/MewsSystems/gitbook-connector-api), revision `e8732c7`). HOS AI is not affiliated with Mews, and Mews has not reviewed or endorsed this mapping. Every payload is synthetic. The adapter has not yet run against a live Mews environment.

The mapping covers the facts the arrival-readiness scenario needs from a PMS: reservations, stays, unit assignment, check-in and check-out, and room states. It reads three documented Mews surfaces:

- [General Webhooks](https://github.com/MewsSystems/gitbook-connector-api/blob/master/events/wh-general.md): `ServiceOrderUpdated` and `ResourceUpdated`;
- [Get all reservations (ver 2023-06-06)](https://github.com/MewsSystems/gitbook-connector-api/blob/master/operations/reservations.md);
- [Get all resources](https://github.com/MewsSystems/gitbook-connector-api/blob/master/operations/resources.md).

## Contents

- `arrival-readiness.json` holds the PMS deliveries of the [arrival-readiness scenario](../../conformance/arrival-readiness/scenario.json), recorded as Mews would send them. Each delivery has a webhook message plus the reservations and resources an integration fetches for it. The file also carries the adapter configuration, the id crosswalk, and every documented difference from the synthetic corpus.
- The reference adapter is `lib/hos/mappings/mews.ts` in the repository. `lib/hos/mappings/mews-replay.ts` rebuilds the scenario with it.
- `tests/unit/mews-mapping.test.ts` checks three things:
  - every mapped fact is a valid HOS event;
  - the mapped facts equal the corpus PMS facts, except for the documented differences;
  - the replay reaches the scenario's `expected.json`, with the adapter's event ids in place of the corpus ids.

The live replay is at `/demo/mews` on the HOS AI website.

## How the adapter works

Mews webhooks carry entity ids only. For each id, the integration calls the matching `getAll` operation. The adapter then compares the fetched entity with what it has already published to HOS, and emits only the facts that changed. Mews payloads and customer profiles are never forwarded.

- **Identities.** HOS ids come from a crosswalk kept by the integration. They are never the Mews GUIDs, so they survive a PMS migration. An entity the crosswalk does not know gets a fresh opaque id.
- **Event ids.** Each id is derived from the Mews entity id, the HOS type and the occurrence time. A retried webhook, or a restarted adapter, therefore publishes the same id, and HOS discards the duplicate.
- **Authority.** The adapter publishes as the property's PMS producer. The producer manifest decides what HOS treats as authoritative. At the demo property, the PMS only mirrors housekeeping status.
- **Business date.** The date of `time` in the property time zone. For `stay.expected`, it is the arrival day.

## Field mapping

| Mews | HOS Events 0.1 | Notes |
| :-- | :-- | :-- |
| Reservation first seen `Optional` / `Confirmed` | `reservation.created` + `stay.expected` | `time` = `CreatedUtc`. `Optional` → `tentative`; `Confirmed`, `Started`, `Processed` → `confirmed`. Planned dates are the local dates of `ScheduledStartUtc` / `ScheduledEndUtc`. |
| `Number`, `Id` | `external_refs` | `confirmation_number` and `reservation_id`, `verified`, issued by the PMS producer. |
| `AccountId` (`AccountType` `Customer`) | `guest_id` | Pseudonymous, through the crosswalk. Company-owned reservations have no `guest_id`. |
| `Inquired`, `Requested` | — | Not a commitment yet; published once `Optional` or `Confirmed`. |
| State, schedule or owner changed | `reservation.updated` | Only the changed fields, at `UpdatedUtc`. `stay.expected` is published again when `ScheduledStartUtc` or `ScheduledEndUtc` moves. |
| `AssignedResourceId` changed | `stay.unit_assigned` | `time` = `UpdatedUtc`. `previous_unit_id` is the unit already published. `reason` is `initial_assignment` for the first unit; otherwise it is not known. |
| `State` `Started` | `stay.checked_in` | `time` = `ActualStartUtc`. |
| `State` `Processed` | `stay.checked_out` | `time` = `ActualEndUtc`. A missed check-in is published first. |
| `State` `Canceled`, reason `NoShow` | `reservation.updated` | `status` = `no_show`, at `CancelledUtc`. |
| `State` `Canceled`, other reasons | `reservation.cancelled` | `RequestedByGuest`, `RequestedByBooker`, `BookedElsewhere`, `PriceTooHigh`, `BookingAbandoned` → `guest_request`; `ServiceNotAvailable` → `property_request`; `InvalidPayment` → `payment_issue`; others → `other`. |
| Resource `Dirty` / `Clean` / `Inspected` | `unit.status_changed`, `housekeeping` | `time` = `UpdatedUtc`. `previous` only when the adapter published it. No `reason`. |
| Resource `OutOfService` / `OutOfOrder` | `unit.status_changed`, `maintenance` | `out_of_service`. Leaving it publishes `operational`, then the housekeeping state. |
| `CustomerAdded`, `CustomerUpdated` | — | Profiles are personal data and stay in Mews. |
| `MessageAdded` | — | An arrival signal has to be extracted from the message; that is not a field mapping. |
| `PaymentUpdated`, `ResourceBlockUpdated` | — | No HOS 0.1 counterpart in this mapping. |

Only accommodation services listed in the configuration become stays. Only active, top-level `Space` resources become units.

## Differences from the synthetic corpus

The Mews replay has 12 facts instead of 13:

- **Delivery 7 is not reproduced.** Mews General Webhooks have no task event, and a Mews task points to a service order, not a resource.
- **Delivery 1:** `external_refs` carry the Mews confirmation number and reservation id.
- **Delivery 2:** `stay.expected` is published with the reservation, at `CreatedUtc`, not on the arrival morning.
- **Delivery 9:** there is no `previous`, `reason` or causation. Mews reports none of them, and the adapter had not seen the room before.

The dispositions, readiness and situations are the same as in the scenario's `expected.json`.

## What the mapping taught us about HOS 0.1

1. **Webhooks say what changed, not how.** Because Mews sends ids only, the adapter's memory of what it published is part of the integration and must be persisted.
2. **A stay has no expected moment in Mews.** HOS Events could say when `stay.expected` is due.
3. **HOS 0.1 cannot remove an assignment.** `stay.unit_assigned` requires a unit, and Mews can unassign one. HOS needs a nullable `unit_id` or an unassignment event.
4. **One Mews state, four HOS dimensions.** `OutOfOrder` replaces the housekeeping state in Mews. HOS keeps both, but the source stops reporting one.
5. **Occurrence times are approximate.** Assignments and room states only carry the entity's last update, `UpdatedUtc`. That is an upper bound when several changes arrive in one fetch.
6. **Provenance stops at the PMS.** Mews does not say who changed a room state, why, or what caused it. The manifest's authority rule is what keeps a mirrored status from overriding the housekeeping system.
7. **Tasks are out of reach.** This integration publishes no housekeeping tasks.

## Not covered yet

- Occupancy from Get resources' occupancy state.
- Out-of-order periods from resource blocks.
- Pagination, rate limits and token handling in a live integration.
- Persistence of the crosswalk and of the adapter's published state.

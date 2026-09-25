# Mews Connector API → HOS Events 0.1 — experimental mapping

Status: **experimental and unofficial**. It is written from Mews's public Connector API documentation ([MewsSystems/gitbook-connector-api](https://github.com/MewsSystems/gitbook-connector-api), revision `e8732c7`). HOS AI is not affiliated with Mews, and Mews has not reviewed or endorsed this mapping. Every payload in the replay is synthetic. The adapter has also run, read-only, against Mews's two public demo enterprises; see the [live check](#live-check).

The mapping covers the facts the arrival-readiness scenario needs from a PMS: reservations, stays, unit assignment, check-in and check-out, and room states. It reads three documented Mews surfaces:

- [General Webhooks](https://github.com/MewsSystems/gitbook-connector-api/blob/master/events/wh-general.md): `ServiceOrderUpdated`, `ResourceUpdated` and `ResourceBlockUpdated`;
- [Get all reservations (ver 2023-06-06)](https://github.com/MewsSystems/gitbook-connector-api/blob/master/operations/reservations.md);
- [Get all resources](https://github.com/MewsSystems/gitbook-connector-api/blob/master/operations/resources.md);
- [Get all resource blocks](https://github.com/MewsSystems/gitbook-connector-api/blob/master/operations/resourceblocks.md), with `ActivityStates` `Active` and `Deleted`.

## Contents

- `arrival-readiness.json` holds the PMS deliveries of the [arrival-readiness scenario](../../conformance/arrival-readiness/scenario.json), recorded as Mews would send them. Each delivery has a webhook message plus the reservations and resources an integration fetches for it. The file also carries the adapter configuration, the id crosswalk, and every documented difference from the synthetic corpus.
- The reference adapter is `lib/hos/mappings/mews.ts` in the repository. `lib/hos/mappings/replay.ts` rebuilds the scenario with it, as it does for the [Apaleo](../apaleo/README.md) and [Cloudbeds](../cloudbeds/README.md) mappings.
- `tests/unit/pms-mappings.test.ts` checks three things:
  - every mapped fact is a valid HOS event;
  - the mapped facts equal the corpus PMS facts, except for the documented differences;
  - the replay reaches the scenario's `expected.json`, with the adapter's event ids in place of the corpus ids.

`tests/unit/mews-adapter.test.ts` covers the adapter's behaviour beyond the scenario. The live replay is at `/demo/mews` on the HOS AI website.

## How the adapter works

Mews webhooks carry entity ids only. For each id, the integration calls the matching `getAll` operation. The adapter then compares the fetched entity with what it has already published to HOS, and emits only the facts that changed. Mews payloads and customer profiles are never forwarded.

- **Identities.** HOS ids come from a crosswalk kept by the integration. They are never the Mews GUIDs, so they survive a PMS migration. An entity the crosswalk does not know gets a fresh opaque id.
- **Event ids.** Each id is derived from the Mews entity id, the HOS type and the occurrence time. A retried webhook, or a restarted adapter, therefore publishes the same id, and HOS discards the duplicate.
- **Authority.** The adapter publishes as the property's PMS producer. The producer manifest decides what HOS treats as authoritative. At the demo property, the PMS only mirrors housekeeping status.
- **Business date.** The date of `time` in the property time zone. For `stay.expected`, it is the arrival day.

## Field mapping

| Mews                                                    | HOS Events 0.1                          | Notes                                                                                                                                                                                                                                   |
| :------------------------------------------------------ | :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reservation first seen `Optional` / `Confirmed`         | `reservation.created` + `stay.expected` | `time` = `CreatedUtc`. `Optional` → `tentative`; `Confirmed`, `Started`, `Processed` → `confirmed`. Planned dates are the local dates of `ScheduledStartUtc` / `ScheduledEndUtc`.                                                       |
| `Number`, `Id`                                          | `external_refs`                         | `confirmation_number` and `reservation_id`, `verified`, issued by the PMS producer.                                                                                                                                                     |
| `AccountId` (`AccountType` `Customer`)                  | `guest_id`                              | Pseudonymous, through the crosswalk. Company-owned reservations have no `guest_id`.                                                                                                                                                     |
| `Inquired`, `Requested`                                 | —                                       | Not a commitment yet; published once `Optional` or `Confirmed`.                                                                                                                                                                         |
| State, schedule or owner changed                        | `reservation.updated`                   | Only the changed fields, at `UpdatedUtc`. `stay.expected` is published again when `ScheduledStartUtc` or `ScheduledEndUtc` moves.                                                                                                       |
| `AssignedResourceId` set or changed                     | `stay.unit_assigned`                    | `time` = `UpdatedUtc`, `hostimebasis` = `modified`. `previous_unit_id` is the unit already published. `reason` is `initial_assignment` for the first unit; otherwise it is not known.                                                   |
| `AssignedResourceId` removed                            | `stay.unit_unassigned`                  | The released unit, at `UpdatedUtc`, `hostimebasis` = `modified`.                                                                                                                                                                        |
| `State` `Started`                                       | `stay.checked_in`                       | `time` = `ActualStartUtc`.                                                                                                                                                                                                              |
| `State` `Processed`                                     | `stay.checked_out`                      | `time` = `ActualEndUtc`. A missed check-in is published first.                                                                                                                                                                          |
| `State` `Canceled`, reason `NoShow`                     | `reservation.updated`                   | `status` = `no_show`, at `CancelledUtc`.                                                                                                                                                                                                |
| `State` `Canceled`, other reasons                       | `reservation.cancelled`                 | `RequestedByGuest`, `RequestedByBooker`, `BookedElsewhere`, `PriceTooHigh`, `BookingAbandoned` → `guest_request`; `ServiceNotAvailable` → `property_request`; `InvalidPayment` → `payment_issue`; others → `other`.                     |
| Resource `Dirty` / `Clean` / `Inspected`                | `unit.status_changed`, `housekeeping`   | `time` = `UpdatedUtc`, `hostimebasis` = `modified`. `previous` only when the adapter published it. No `reason`.                                                                                                                         |
| Resource `OutOfService` / `OutOfOrder`                  | `unit.status_changed`, `maintenance`    | `out_of_service`. Leaving it publishes `operational`, then the housekeeping state.                                                                                                                                                      |
| `CustomerAdded`, `CustomerUpdated`                      | —                                       | Profiles are personal data and stay in Mews.                                                                                                                                                                                            |
| `MessageAdded`                                          | —                                       | An arrival signal has to be extracted from the message; that is not a field mapping.                                                                                                                                                    |
| Resource block `OutOfOrder`                             | `unit.maintenance_scheduled`            | `starts_at` = `StartUtc`, `ends_at` = `EndUtc`. `statuses`: `out_of_service` and `not_sellable`. Dated by `CreatedUtc` for a new block, by `UpdatedUtc` with `hostimebasis` `modified` after a change. `Name` and `Notes` stay in Mews. |
| Resource block `InternalUse`                            | `unit.maintenance_scheduled`            | `statuses`: `not_sellable`; `reason` = `internal_use`.                                                                                                                                                                                  |
| Resource block deleted (`IsActive` false, `DeletedUtc`) | `unit.maintenance_cancelled`            | At `DeletedUtc`.                                                                                                                                                                                                                        |
| `PaymentUpdated`                                        | —                                       | No HOS 0.1 counterpart in this mapping.                                                                                                                                                                                                 |

Only accommodation services listed in the configuration become stays. Every active `Space` resource becomes a unit, a bed as well as its room: Mews assigns a dorm stay to the bed, a child resource of the room.

## Differences from the synthetic corpus

The Mews replay has 12 facts instead of 13:

- **Delivery 7 is not reproduced.** Mews General Webhooks have no task event, and a Mews task points to a service order, not a resource.
- **Delivery 1:** `external_refs` carry the Mews confirmation number and reservation id.
- **Delivery 2:** `stay.expected` is published with the reservation, at `CreatedUtc`, not on the arrival morning.
- **Delivery 3:** `hostimebasis` is `modified`: Mews dates the assignment only by the reservation's last update.
- **Delivery 9:** `hostimebasis` is `modified`, and there is no `previous`, `reason` or causation. Mews reports none of them, and the adapter had not seen the room before.

The dispositions, readiness and situations are the same as in the scenario's `expected.json`.

## What the mapping taught us about HOS 0.1

1. **Webhooks say what changed, not how.** Because Mews sends ids only, the adapter's memory of what it published is part of the integration and must be persisted.
2. **A stay has no expected moment in Mews.** HOS Events now says when `stay.expected` is due: as soon as the stay is committed, with the arrival day as its business date.
3. **Removing an assignment needed an event.** `stay.unit_assigned` requires a unit, and Mews can unassign one. HOS 0.1 now has `stay.unit_unassigned`.
4. **One Mews state, four HOS dimensions.** `OutOfOrder` replaces the housekeeping state in Mews. HOS keeps both, but the source stops reporting one.
5. **Occurrence times are approximate.** Assignments and room states only carry the entity's last update, `UpdatedUtc`. That is an upper bound when several changes arrive in one fetch. HOS 0.1 now says so with `hostimebasis` `modified`.
6. **Provenance stops at the PMS.** Mews does not say who changed a room state, why, or what caused it. The manifest's authority rule is what keeps a mirrored status from overriding the housekeeping system.
7. **Tasks are out of reach.** This integration publishes no housekeeping tasks.

## Live check

`npm run mews:live` runs the adapter against a live Mews Connector API environment, such as the public demo environment Mews documents under Getting started, Environments. It is read-only: it calls `configuration/get` and the `getAll` operations for services, reservations, resources and resource blocks, and nothing else. The tokens come from `MEWS_CLIENT_TOKEN` and `MEWS_ACCESS_TOKEN` and are never printed or stored.

```sh
MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… npm run mews:live -- --days 1 --out mews-live.json
```

The run does what an integration does before its first webhook. Every fetched entity goes through the adapter, and the check reports:

- how many HOS facts each type produced, and why the rest were not mapped;
- every fact that fails the HOS 0.1 schemas;
- how many facts a second pass over the same data publishes: none, if the adapter is idempotent;
- today's arrivals as the arrival-readiness projection sees them: readiness, maintenance windows and situations.

The report keeps HOS ids, counts and room names. It never keeps Mews payloads or customer data. Accommodation services are the active bookable services, sold by the day or the month, that have a resource category of a place to stay: `Room`, `Bed`, `Dorm`, `Apartment`, `Suite`, `Villa`, `Site`, `Tent`, `CaravanOrRV` or `UnequippedCampsite`. That takes one more call, Get all resource categories. `MEWS_SERVICE_IDS` overrides the selection. A `429` waits for `Retry-After`, or backs off, and retries: the demo tokens are public and shared. The logic is `lib/hos/mappings/mews-sync.ts`, on top of `lib/hos/mappings/sync.ts`, which the [Apaleo](../apaleo/README.md#live-check) and [Cloudbeds](../cloudbeds/README.md#live-check) live checks share. It is tested offline in `tests/unit/mews-sync.test.ts`.

### First runs, 25 September 2026

The check ran against both demo enterprises, with a one-day window:

| Enterprise                     | Fetched                                              | HOS facts | Schema errors | Second pass | Arrivals still expected  |
| :----------------------------- | :--------------------------------------------------- | --------: | ------------: | ----------: | :----------------------- |
| Gross pricing, Europe/Budapest | 632 reservations, 1,532 resources, 6 resource blocks |     2,293 |             0 |           0 | 10: 1 ready, 9 not ready |
| Net pricing, America/New_York  | 57 reservations, 1,052 resources                     |     1,192 |             0 |           0 | 7: 3 ready, 4 not ready  |

Every Mews field the adapter reads was present, and every state it met is documented. The only entities not mapped were reservations cancelled before HOS knew them, as expected on a first synchronisation. The demo data is shared and changes all day, so these counts are a snapshot.

The first runs changed the integration in three ways:

- **Beds are units.** The demo enterprises assign dorm stays to beds, 13 of 188 live stays in the Gross enterprise and 2 of 36 in the Net one. The adapter used to keep top-level resources only, so those stays pointed to units HOS never heard of, and their readiness could not be known.
- **Accommodation is chosen by category, not by time unit.** Parking and full-day meeting rooms are sold by the day, and long stays by the month. Taking the services sold by the day, as the check first did, took in a parking service, a meeting-room service and a membership, and left out a monthly long-stay service.
- **The public tokens are rate-limited together.** The very first call answered `429`. The check now retries.

The summary line now counts readiness only among the stays still expected. Stays that arrived today and are already in house, or gone, read not ready in the room they used.

## Not covered yet

- Occupancy from Get resources' occupancy state.
- A room and its beds as one space: a guest in a whole dorm does not occupy its beds in HOS, nor a guest in a bed the dorm.
- Parking spots, meeting rooms and desks are units too, since they are spaces. Their resource categories would tell them apart, but the adapter does not read resource category assignments yet.
- Webhook subscriptions in a live integration.
- Persistence of the crosswalk and of the adapter's published state.

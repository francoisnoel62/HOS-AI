import { describe, expect, it } from "vitest";

import { loadExpectedOutcome, toExpectedOutcome } from "@/lib/hos/conformance";
import { createIdentityRegistry, createMewsAdapter, type MewsReservation, type MewsResource } from "@/lib/hos/mappings/mews";
import { buildMewsArrivalStream } from "@/lib/hos/mappings/mews-replay";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

import { errors, validateEvent } from "./hos-schemas";

const { scenario, manifests, corpus, recording, stream } = buildMewsArrivalStream();
const mapped = stream.filter((fact) => fact.mews);

// Required properties, as documented for the Mews Connector API revision named in the recording.
const webhookDiscriminators = ["ServiceOrderUpdated", "ResourceUpdated", "MessageAdded", "ResourceBlockUpdated", "CustomerAdded", "CustomerUpdated", "PaymentUpdated"];
const reservationProperties = ["Id", "ServiceId", "AccountId", "AccountType", "CreatorProfileId", "UpdaterProfileId", "Number", "State", "Origin", "CreatedUtc", "UpdatedUtc", "Options", "RateId", "GroupId", "RequestedResourceCategoryId", "AssignedResourceLocked", "ScheduledStartUtc", "ScheduledEndUtc", "PersonCounts"];
const resourceProperties = ["Id", "EnterpriseId", "IsActive", "Name", "State", "Descriptions", "CreatedUtc", "UpdatedUtc", "Data", "ExternalNames", "Directions"];

function omit(event: HosFact, fields: string[]) {
  const copy = structuredClone(event) as unknown as Record<string, Record<string, unknown>>;
  for (const field of ["id", "hosrecordedat", ...fields]) {
    const [head, tail] = field.split(".");
    if (tail) delete copy[head][tail];
    else delete copy[head];
  }
  return copy;
}

describe("Mews recording of the arrival scenario", () => {
  const reservations = recording.deliveries.flatMap((item) => item.fetched.flatMap((call) => call.response.Reservations ?? []));
  const resources = recording.deliveries.flatMap((item) => item.fetched.flatMap((call) => call.response.Resources ?? []));

  it("uses the documented webhook message shape", () => {
    for (const { webhook } of recording.deliveries) {
      expect(Object.keys(webhook).sort()).toEqual(["EnterpriseId", "Events", "IntegrationId"]);
      for (const event of webhook.Events) {
        expect(webhookDiscriminators).toContain(event.Discriminator);
        expect(Object.keys(event.Value)).toEqual(["Id"]);
      }
    }
  });

  it("fetches reservations and resources with every required property", () => {
    expect(reservations.length).toBeGreaterThan(0);
    expect(resources.length).toBeGreaterThan(0);
    for (const reservation of reservations) expect(Object.keys(reservation)).toEqual(expect.arrayContaining(reservationProperties));
    for (const resource of resources) expect(Object.keys(resource)).toEqual(expect.arrayContaining(resourceProperties));
    const operations = new Set(recording.deliveries.flatMap((item) => item.fetched.map((call) => call.operation)));
    expect([...operations].sort()).toEqual(["reservations/getAll/2023-06-06", "resources/getAll"]);
  });

  it("accounts for every PMS delivery of the corpus", () => {
    const pms = corpus.flatMap((event, index) => (event.source === recording.adapter.source ? [index + 1] : []));
    const covered = [...recording.deliveries.flatMap((item) => item.reproduces), ...recording.not_reproduced.map((item) => item.delivery)];
    expect(covered.sort((a, b) => a - b)).toEqual(pms);
  });
});

describe("Mews to HOS Events 0.1 mapping", () => {
  it.each(mapped.map((fact) => [fact.mews!.delivery, fact.event.type, fact.event] as const))("maps Mews delivery %s to a valid %s", (_delivery, _type, event) => {
    expect(validateEvent(event), errors(validateEvent)).toBe(true);
  });

  it("maps each Mews delivery to exactly the facts it reproduces", () => {
    for (const delivery of recording.deliveries) expect(mapped.filter((fact) => fact.mews === delivery)).toHaveLength(delivery.reproduces.length);
  });

  it("reproduces the corpus PMS facts, apart from the documented differences", () => {
    for (const { corpusDelivery, event } of mapped) {
      const expected = corpus[corpusDelivery - 1];
      const fields = recording.differences.filter((item) => item.delivery === corpusDelivery).map((item) => item.field);
      expect(event.type).toBe(expected.type);
      expect(omit(event, fields)).toEqual(omit(expected, fields));
    }
  });

  it("reaches the published expected outcome of the scenario", () => {
    const steps = replayArrivalReadiness(
      stream.map((fact) => fact.event),
      manifests,
      scenario.projection,
    );
    const actual = toExpectedOutcome(steps, scenario);
    const corpusDelivery = (delivery: number) => stream[delivery - 1].corpusDelivery;

    // The mapped facts carry the adapter's ids; everything else must match the corpus outcome exactly.
    const ids = new Map(mapped.map((fact) => [corpus[fact.corpusDelivery - 1].id, fact.event.id]));
    const skipped = new Set(recording.not_reproduced.map((item) => item.delivery));
    const published = JSON.parse(JSON.stringify(loadExpectedOutcome()), (_key, value) => (typeof value === "string" && ids.has(value) ? ids.get(value) : value)) as ReturnType<typeof loadExpectedOutcome>;

    expect(actual.deliveries.map((item) => ({ ...item, delivery: corpusDelivery(item.delivery) }))).toEqual(published.deliveries.filter((item) => !skipped.has(item.delivery)));
    expect(actual.situations.map((item) => ({ ...item, delivery: corpusDelivery(item.delivery) }))).toEqual(published.situations);
  });
});

describe("Mews adapter", () => {
  const [created, assigned] = recording.deliveries;
  const reservation = created.fetched[0].response.Reservations![0];
  const room = recording.deliveries[2].fetched[0].response.Resources![0];
  const adapter = () => createMewsAdapter({ ...recording.adapter, identities: createIdentityRegistry(recording.adapter.crosswalk) });
  const webhook = (Discriminator: string, Id: string, EnterpriseId = created.webhook.EnterpriseId) => ({ EnterpriseId, IntegrationId: created.webhook.IntegrationId, Events: [{ Discriminator, Value: { Id } }] });

  function sync(target: ReturnType<typeof adapter>, change: Partial<MewsReservation>, received_at = change.UpdatedUtc ?? reservation.UpdatedUtc) {
    const result = target.handle({ received_at, webhook: webhook("ServiceOrderUpdated", reservation.Id), reservations: [{ ...reservation, ...change }] });
    for (const event of result.events) expect(validateEvent(event), errors(validateEvent)).toBe(true);
    return result;
  }

  function sense(target: ReturnType<typeof adapter>, change: Partial<MewsResource>) {
    const result = target.handle({ received_at: change.UpdatedUtc ?? room.UpdatedUtc, webhook: webhook("ResourceUpdated", room.Id), resources: [{ ...room, ...change }] });
    for (const event of result.events) expect(validateEvent(event), errors(validateEvent)).toBe(true);
    return result;
  }

  const types = (events: HosFact[]) => events.map((event) => event.type);

  it("publishes nothing new when Mews retries a webhook", () => {
    const target = adapter();
    expect(types(sync(target, {}).events)).toEqual(["reservation.created", "stay.expected"]);
    const retried = sync(target, {});
    expect(retried.events).toEqual([]);
    expect(retried.unmapped).toEqual([{ discriminator: "ServiceOrderUpdated", id: reservation.Id, reason: "No change since the last fetch." }]);
  });

  it("gives a restarted adapter the same event ids, so HOS discards the redelivery", () => {
    const first = sync(adapter(), {}).events;
    const again = sync(adapter(), {}, "2026-07-12T14:09:00Z").events;
    expect(again.map((event) => event.id)).toEqual(first.map((event) => event.id));
    const dispositions = replayArrivalReadiness([...first, ...again], manifests, scenario.projection).map((step) => step.disposition);
    expect(dispositions).toEqual(["applied", "applied", "duplicate", "duplicate"]);
  });

  it("waits for a commitment before publishing a reservation", () => {
    const target = adapter();
    const inquiry = sync(target, { State: "Inquired" });
    expect(inquiry.events).toEqual([]);
    expect(inquiry.unmapped[0].reason).toMatch(/not a commitment yet/);
    const optional = sync(target, { State: "Optional", UpdatedUtc: "2026-07-12T15:00:00Z" }).events;
    expect(optional[0]).toMatchObject({ type: "reservation.created", data: { status: "tentative" } });
    expect(sync(target, { State: "Confirmed", UpdatedUtc: "2026-07-13T08:00:00Z" }).events).toMatchObject([{ type: "reservation.updated", data: { changed_fields: ["status"], status: "confirmed" } }]);
  });

  it("maps a no-show to a status update and other cancellations to reservation.cancelled", () => {
    const noShow = adapter();
    sync(noShow, {});
    expect(sync(noShow, { State: "Canceled", CancellationReason: "NoShow", CancelledUtc: "2026-07-31T02:00:00Z", UpdatedUtc: "2026-07-31T02:00:00Z" }).events).toMatchObject([
      { type: "reservation.updated", time: "2026-07-31T02:00:00Z", data: { changed_fields: ["status"], status: "no_show" } },
    ]);

    const cancelled = adapter();
    sync(cancelled, {});
    expect(sync(cancelled, { State: "Canceled", CancellationReason: "RequestedByGuest", CancelledUtc: "2026-07-20T10:00:00Z", UpdatedUtc: "2026-07-20T10:00:00Z" }).events).toMatchObject([
      { type: "reservation.cancelled", data: { reason: "guest_request" } },
    ]);
    expect(sync(cancelled, { State: "Canceled", CancellationReason: "RequestedByGuest", UpdatedUtc: "2026-07-20T11:00:00Z" }).events).toEqual([]);
  });

  it("reports a planned-date change as reservation.updated and a new stay.expected", () => {
    const target = adapter();
    sync(target, {});
    const moved = sync(target, { ScheduledStartUtc: "2026-07-31T13:00:00Z", UpdatedUtc: "2026-07-20T09:00:00Z" }).events;
    expect(moved).toMatchObject([
      { type: "reservation.updated", data: { changed_fields: ["planned_arrival_date"], planned_arrival_date: "2026-07-31" } },
      { type: "stay.expected", time: "2026-07-20T09:00:00Z", hosbusinessdate: "2026-07-31", data: { planned_arrival_at: "2026-07-31T13:00:00Z" } },
    ]);
  });

  it("keeps the assignment history and reports the unassignment HOS 0.1 cannot express", () => {
    const target = adapter();
    sync(target, {});
    expect(sync(target, assigned.fetched[0].response.Reservations![0]).events).toMatchObject([{ type: "stay.unit_assigned", data: { unit_id: "unit_204", previous_unit_id: null, reason: "initial_assignment" } }]);
    const moved = sync(target, { AssignedResourceId: "0b3f6a3e-8f1d-4c2a-9a57-3c1d2e4f5a6b", UpdatedUtc: "2026-07-30T07:00:00Z" }).events;
    expect(moved).toMatchObject([{ type: "stay.unit_assigned", data: { previous_unit_id: "unit_204" } }]);
    expect(moved[0].data).not.toHaveProperty("reason");
    expect((moved[0].data as { unit_id: string }).unit_id).toMatch(/^unit_[0-9a-f]{16}$/);
    const unassigned = sync(target, { AssignedResourceId: null, UpdatedUtc: "2026-07-30T07:30:00Z" });
    expect(unassigned.events).toEqual([]);
    expect(unassigned.unmapped[0].reason).toMatch(/no event that removes an assignment/);
  });

  it("publishes a missed check-in before the check-out", () => {
    const target = adapter();
    sync(target, assigned.fetched[0].response.Reservations![0]);
    const departed = sync(target, { AssignedResourceId: room.Id, State: "Processed", ActualStartUtc: "2026-07-30T12:40:00Z", ActualEndUtc: "2026-08-01T08:10:00Z", UpdatedUtc: "2026-08-01T08:10:00Z" }).events;
    expect(departed.map((event) => [event.type, event.time])).toEqual([
      ["stay.checked_in", "2026-07-30T12:40:00Z"],
      ["stay.checked_out", "2026-08-01T08:10:00Z"],
    ]);
  });

  it("keeps each Mews resource state on its HOS dimension", () => {
    const target = adapter();
    expect(sense(target, { State: "OutOfOrder", UpdatedUtc: "2026-07-29T09:00:00Z" }).events).toMatchObject([{ data: { dimension: "maintenance", current: "out_of_service" } }]);
    const back = sense(target, { State: "Dirty", UpdatedUtc: "2026-07-29T16:00:00Z" }).events;
    expect(back.map((event) => event.data)).toEqual([
      { unit_id: "unit_204", dimension: "maintenance", previous: "out_of_service", current: "operational", authority_source: "urn:hos:pms:demo" },
      { unit_id: "unit_204", dimension: "housekeeping", current: "dirty", authority_source: "urn:hos:pms:demo" },
    ]);
    expect(sense(target, { State: "Inspected", UpdatedUtc: "2026-07-30T10:10:00Z" }).events).toMatchObject([{ data: { dimension: "housekeeping", previous: "dirty", current: "inspected" } }]);
  });

  it("leaves other services, other enterprises and customer profiles out of HOS", () => {
    const target = adapter();
    expect(sync(target, { ServiceId: "6015cefd-5347-4a04-be80-1f1931d58c6b" }).unmapped[0].reason).toBe("Not an accommodation service at this property.");
    const stranger = target.handle({ received_at: reservation.UpdatedUtc, webhook: webhook("ServiceOrderUpdated", reservation.Id, "00000000-0000-4000-8000-000000000000"), reservations: [reservation] });
    expect(stranger).toEqual({ events: [], unmapped: [{ discriminator: "ServiceOrderUpdated", id: reservation.Id, reason: "The enterprise is not configured as a HOS property." }] });
    const customer = target.handle({ received_at: reservation.UpdatedUtc, webhook: created.webhook, reservations: [] });
    expect(customer.events).toEqual([]);
    expect(customer.unmapped.map((item) => item.discriminator)).toEqual(["CustomerAdded", "CustomerUpdated", "ServiceOrderUpdated"]);
    expect(customer.unmapped[0].reason).toMatch(/pseudonymous guest_id/);
  });
});

import { createIdentityRegistry, type HosFact, validateEvent } from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { describe, expect, it } from "vitest";

import type { MappingRecording } from "@/lib/hos/mappings/common";
import { createMewsAdapter, type MewsAdapterConfig, type MewsReservation, type MewsResource, type MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { loadArrivalScenario } from "@/lib/spec";

const { scenario, manifests } = loadArrivalScenario();
const recording: MappingRecording = loadRecording("mews");
const fetched = (delivery: number) => recording.deliveries[delivery].fetched[0].response as { Reservations?: MewsReservation[]; Resources?: MewsResource[] };

describe("Mews adapter", () => {
  const created = recording.deliveries[0].webhook as { EnterpriseId: string; IntegrationId: string; Events: Array<{ Discriminator: string; Value: { Id: string } }> };
  const reservation = fetched(0).Reservations![0];
  const assigned = fetched(1).Reservations![0];
  const room = fetched(2).Resources![0];
  const adapter = () => createMewsAdapter({ ...(recording.adapter as unknown as Omit<MewsAdapterConfig, "identities">), identities: createIdentityRegistry(recording.adapter.crosswalk) });
  const webhook = (Discriminator: string, Id: string, EnterpriseId = created.EnterpriseId) => ({ EnterpriseId, IntegrationId: created.IntegrationId, Events: [{ Discriminator, Value: { Id } }] });

  function sync(target: ReturnType<typeof adapter>, change: Partial<MewsReservation>, received_at = change.UpdatedUtc ?? reservation.UpdatedUtc) {
    const result = target.handle({ received_at, webhook: webhook("ServiceOrderUpdated", reservation.Id), reservations: [{ ...reservation, ...change }] });
    for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
    return result;
  }

  function sense(target: ReturnType<typeof adapter>, change: Partial<MewsResource>) {
    const result = target.handle({ received_at: change.UpdatedUtc ?? room.UpdatedUtc, webhook: webhook("ResourceUpdated", room.Id), resources: [{ ...room, ...change }] });
    for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
    return result;
  }

  const types = (events: HosFact[]) => events.map((event) => event.type);

  it("publishes nothing new when Mews retries a webhook", () => {
    const target = adapter();
    expect(types(sync(target, {}).events)).toEqual(["reservation.created", "stay.expected"]);
    const retried = sync(target, {});
    expect(retried.events).toEqual([]);
    expect(retried.unmapped).toEqual([{ event: "ServiceOrderUpdated", id: reservation.Id, reason: "No change since the last fetch." }]);
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

  it("keeps the assignment history, releases included, dated by the reservation's last update", () => {
    const target = adapter();
    sync(target, {});
    expect(sync(target, assigned).events).toMatchObject([{ type: "stay.unit_assigned", hostimebasis: "modified", data: { unit_id: "unit_204", previous_unit_id: null, reason: "initial_assignment" } }]);
    const moved = sync(target, { AssignedResourceId: "0b3f6a3e-8f1d-4c2a-9a57-3c1d2e4f5a6b", UpdatedUtc: "2026-07-30T07:00:00Z" }).events;
    expect(moved).toMatchObject([{ type: "stay.unit_assigned", data: { previous_unit_id: "unit_204" } }]);
    expect(moved[0].data).not.toHaveProperty("reason");
    expect((moved[0].data as { unit_id: string }).unit_id).toMatch(/^unit_[0-9a-f]{16}$/);
    const released = sync(target, { AssignedResourceId: null, UpdatedUtc: "2026-07-30T07:30:00Z" }).events;
    expect(released).toMatchObject([{ type: "stay.unit_unassigned", time: "2026-07-30T07:30:00Z", hostimebasis: "modified", data: { unit_id: (moved[0].data as { unit_id: string }).unit_id } }]);
    const reassigned = sync(target, { AssignedResourceId: room.Id, UpdatedUtc: "2026-07-30T08:00:00Z" }).events;
    expect(reassigned).toMatchObject([{ type: "stay.unit_assigned", data: { unit_id: "unit_204", previous_unit_id: null } }]);
    expect(reassigned[0].data).not.toHaveProperty("reason");
  });

  it("publishes a missed check-in before the check-out", () => {
    const target = adapter();
    sync(target, assigned);
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

  it("maps resource blocks to maintenance windows, and a deleted block to a cancellation", () => {
    const target = adapter();
    const base: MewsResourceBlock & { Name: string; Notes: string } = { Id: "7f8e9d0c-1b2a-3c4d-5e6f-7a8b9c0d1e2f", EnterpriseId: created.EnterpriseId, AssignedResourceId: room.Id, IsActive: true, Type: "OutOfOrder", StartUtc: "2026-07-30T08:00:00Z", EndUtc: "2026-07-30T16:00:00Z", CreatedUtc: "2026-07-28T09:00:00Z", UpdatedUtc: "2026-07-28T09:00:00Z", DeletedUtc: null, Name: "Air conditioning", Notes: "Guest complained about the noise" };
    const block = (change: Partial<MewsResourceBlock>) => {
      const result = target.handle({ received_at: change.UpdatedUtc ?? base.UpdatedUtc, webhook: webhook("ResourceBlockUpdated", base.Id), resourceBlocks: [{ ...base, ...change }] });
      for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
      return result;
    };
    const [planned] = block({}).events;
    expect(planned).toMatchObject({ type: "unit.maintenance_scheduled", time: "2026-07-28T09:00:00Z", data: { unit_id: "unit_204", starts_at: "2026-07-30T08:00:00Z", ends_at: "2026-07-30T16:00:00Z", statuses: { maintenance: "out_of_service", commercial: "not_sellable" } } });
    expect(planned).not.toHaveProperty("hostimebasis");
    expect(JSON.stringify(planned)).not.toMatch(/Air conditioning|noise/);
    const moved = block({ Type: "InternalUse", EndUtc: "2026-07-30T20:00:00Z", UpdatedUtc: "2026-07-29T10:00:00Z" }).events;
    expect(moved).toMatchObject([{ hostimebasis: "modified", data: { maintenance_id: (planned.data as { maintenance_id: string }).maintenance_id, statuses: { commercial: "not_sellable" }, reason: "internal_use" } }]);
    expect(block({ IsActive: false, DeletedUtc: "2026-07-29T12:00:00Z", UpdatedUtc: "2026-07-29T12:00:00Z" }).events).toMatchObject([{ type: "unit.maintenance_cancelled", time: "2026-07-29T12:00:00Z", data: { unit_id: "unit_204" } }]);
    expect(block({ IsActive: false, DeletedUtc: "2026-07-29T12:00:00Z", UpdatedUtc: "2026-07-29T12:00:00Z" }).unmapped[0].reason).toBe("No change since the last fetch.");
  });

  it("leaves other services, other enterprises and customer profiles out of HOS", () => {
    const target = adapter();
    expect(sync(target, { ServiceId: "6015cefd-5347-4a04-be80-1f1931d58c6b" }).unmapped[0].reason).toBe("Not an accommodation service at this property.");
    const stranger = target.handle({ received_at: reservation.UpdatedUtc, webhook: webhook("ServiceOrderUpdated", reservation.Id, "00000000-0000-4000-8000-000000000000"), reservations: [reservation] });
    expect(stranger).toEqual({ events: [], unmapped: [{ event: "ServiceOrderUpdated", id: reservation.Id, reason: "The enterprise is not configured as a HOS property." }] });
    const customer = target.handle({ received_at: reservation.UpdatedUtc, webhook: created, reservations: [] });
    expect(customer.events).toEqual([]);
    expect(customer.unmapped.map((item) => item.event)).toEqual(["CustomerAdded", "CustomerUpdated", "ServiceOrderUpdated"]);
    expect(customer.unmapped[0].reason).toMatch(/pseudonymous guest_id/);
  });
});

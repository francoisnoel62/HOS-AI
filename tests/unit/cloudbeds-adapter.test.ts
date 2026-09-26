import { createIdentityRegistry, type HosFact, type StayExpected, validateEvent } from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { describe, expect, it } from "vitest";

import {
  type CloudbedsAdapterConfig,
  type CloudbedsReservation,
  type CloudbedsRoomStatus,
  type CloudbedsWebhook,
  createCloudbedsAdapter,
} from "@/lib/hos/mappings/cloudbeds";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { loadArrivalScenario } from "@/lib/spec";

const { scenario, manifests } = loadArrivalScenario();
const recording = loadRecording("cloudbeds");
const config = recording.adapter as unknown as Omit<CloudbedsAdapterConfig, "identities">;
const webhook = (index: number) => recording.deliveries[index].webhook as CloudbedsWebhook;
const data = <T>(index: number) => (recording.deliveries[index].fetched[0].response as { data: T }).data;
const seconds = (iso: string) => Date.parse(iso) / 1000;

describe("Cloudbeds adapter", () => {
  const reservation = data<CloudbedsReservation>(0);
  const assigned = data<CloudbedsReservation>(1);
  const room = data<CloudbedsRoomStatus[]>(2)[0];
  const adapter = () => createCloudbedsAdapter({ ...config, identities: createIdentityRegistry(recording.adapter.crosswalk) });
  const types = (events: HosFact[]) => events.map((event) => event.type);
  const status = (event: HosFact) => event.data as { dimension?: string; previous?: string; current?: string };

  function send(
    target: ReturnType<typeof adapter>,
    hook: Partial<CloudbedsWebhook>,
    change: Partial<CloudbedsReservation>,
    at: string,
    base = reservation,
  ) {
    const result = target.handle({
      received_at: at,
      webhook: { ...webhook(0), timestamp: seconds(at), ...hook },
      reservation: { ...base, ...change },
    });
    for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
    return result;
  }

  function sense(target: ReturnType<typeof adapter>, change: Partial<CloudbedsRoomStatus>, at: string, hook: Partial<CloudbedsWebhook> = {}) {
    const result = target.handle({ received_at: at, webhook: { ...webhook(2), timestamp: seconds(at), ...hook }, rooms: [{ ...room, ...change }] });
    for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
    return result;
  }

  const created = (target: ReturnType<typeof adapter>) => send(target, {}, {}, "2026-07-12T14:03:00Z");
  const statusChanged = (status: string) => ({ event: "reservation/status_changed", status, actor: { type: "user", id: "70311" } });

  it("publishes nothing new when Cloudbeds redelivers a webhook", () => {
    const target = adapter();
    expect(types(created(target).events)).toEqual(["reservation.created", "stay.expected"]);
    const again = created(target);
    expect(again.events).toEqual([]);
    expect(again.unmapped).toEqual([{ event: "reservation/created", id: reservation.reservationID, reason: "No change since the last fetch." }]);
  });

  it("gives a restarted adapter the same event ids, so HOS discards the redelivery", () => {
    const first = created(adapter()).events;
    const again = created(adapter()).events;
    expect(again.map((event) => event.id)).toEqual(first.map((event) => event.id));
    expect(replayArrivalReadiness([...first, ...again], manifests, scenario.projection).map((step) => step.disposition)).toEqual([
      "applied",
      "applied",
      "duplicate",
      "duplicate",
    ]);
  });

  it("keeps the precision of Cloudbeds timestamps", () => {
    const [fact] = send(adapter(), { timestamp: 1783864980.816514 }, {}, "2026-07-12T14:03:01Z").events;
    expect(fact.time).toBe("2026-07-12T14:03:00.817Z");
  });

  it("dates what an event reports and names its actor, and marks the rest as recorded when the adapter learns it", () => {
    const late = send(adapter(), statusChanged("checked_in"), { ...assigned, status: "checked_in" }, "2026-07-30T10:35:00Z");
    expect(late.events.map((event) => [event.type, event.hostimebasis ?? "occurred", event.hosactor ?? null])).toEqual([
      ["reservation.created", "recorded", null],
      ["stay.expected", "recorded", null],
      ["stay.unit_assigned", "recorded", null],
      ["stay.checked_in", "occurred", "user:staff_r7"],
    ]);
  });

  it("turns arrival and departure days into instants with the property's check-in and check-out times", () => {
    const unassigned = reservation.unassigned!.map((line) => ({ ...line, startDate: "2026-12-20", endDate: "2026-12-22" }));
    const [, winter] = send(adapter(), {}, { startDate: "2026-12-20", endDate: "2026-12-22", unassigned }, "2026-11-02T10:00:00Z").events;
    expect(winter.data).toMatchObject({ planned_arrival_at: "2026-12-20T14:00:00Z", planned_departure_at: "2026-12-22T10:00:00Z" });
  });

  it("maps cancellations without a reason, and no-shows as a status", () => {
    const cancelled = adapter();
    created(cancelled);
    expect(send(cancelled, statusChanged("canceled"), { status: "canceled" }, "2026-07-20T09:00:00Z").events).toEqual([
      expect.objectContaining({ type: "reservation.cancelled", time: "2026-07-20T09:00:00Z", data: { reservation_id: "res_1042" } }),
    ]);

    const noShow = adapter();
    created(noShow);
    expect(send(noShow, statusChanged("no_show"), { status: "no_show" }, "2026-07-31T02:00:00Z").events).toMatchObject([
      { type: "reservation.updated", data: { status: "no_show" } },
    ]);
  });

  it("keeps the assignment history, releases included", () => {
    const target = adapter();
    created(target);
    const moved = { ...assigned.assigned![0], roomID: "418204-15", roomName: "207" };
    send(target, { event: "reservation/accommodation_changed" }, assigned, "2026-07-30T06:06:00Z");
    expect(
      send(target, { event: "reservation/accommodation_changed" }, { ...assigned, assigned: [moved] }, "2026-07-30T07:00:00Z").events,
    ).toMatchObject([{ type: "stay.unit_assigned", data: { previous_unit_id: "unit_204" } }]);
    const released = send(target, { event: "reservation/accommodation_changed" }, reservation, "2026-07-30T07:30:00Z").events;
    expect(released).toEqual([
      expect.objectContaining({
        type: "stay.unit_unassigned",
        time: "2026-07-30T07:30:00Z",
        data: { stay_id: "stay_1042", unit_id: expect.stringMatching(/^unit_/) },
      }),
    ]);
    expect(released[0]).not.toHaveProperty("hostimebasis");
  });

  it("gives each room of a reservation its own stay", () => {
    const second = { roomTypeID: "501233", subReservationID: "5830021042-2", startDate: "2026-07-31", endDate: "2026-08-01" };
    const result = send(adapter(), {}, { unassigned: [...reservation.unassigned!, second] }, "2026-07-12T14:03:00Z").events;
    expect(result.map((event) => event.type)).toEqual(["reservation.created", "stay.expected", "stay.expected"]);
    const [, first, other] = result as StayExpected[];
    expect(first.data).toMatchObject({ stay_id: "stay_1042", reservation_id: "res_1042", planned_arrival_at: "2026-07-30T13:00:00Z" });
    expect(other.data).toMatchObject({ reservation_id: "res_1042", planned_arrival_at: "2026-07-31T13:00:00Z" });
    expect(other.data.stay_id).not.toBe("stay_1042");
    expect(other.hosbusinessdate).toBe("2026-07-31");
  });

  it("maps a blocked room to not sellable, and accepts either spelling of the ids", () => {
    const target = adapter();
    const blocked = sense(target, { roomBlocked: true }, "2026-07-29T09:00:00Z", {
      propertyID: undefined,
      propertyID_str: undefined,
      propertyId: 418204,
      roomID: undefined,
      roomId: "418204-12",
    });
    expect(blocked.events.map((event) => [status(event).dimension, status(event).current, event.hostimebasis ?? "occurred"])).toEqual([
      ["occupancy", "vacant", "recorded"],
      ["housekeeping", "clean", "occurred"],
      ["commercial", "not_sellable", "recorded"],
    ]);
    expect(sense(target, { roomBlocked: false }, "2026-07-29T16:00:00Z").events).toMatchObject([
      { data: { dimension: "commercial", previous: "not_sellable", current: "sellable" } },
    ]);
  });

  it("maps a room block to one maintenance window per room, and its removal to cancellations", () => {
    const target = adapter();
    const block = {
      roomBlockID: "RB-311",
      roomBlockType: "out_of_service",
      roomBlockReason: "Leaking shower",
      startDate: "2026-07-30",
      endDate: "2026-07-30",
      rooms: [
        { eventID: "EV-1", roomID: "418204-12" },
        { eventID: "EV-2", roomID: "418204-15" },
      ],
    };
    const handle = (event: string, at: string, roomBlocks: (typeof block)[] = []) => {
      const result = target.handle({
        received_at: at,
        webhook: { version: "1.0", event, timestamp: seconds(at), propertyID: 418204, propertyID_str: "418204", roomBlockID: "RB-311" },
        roomBlocks,
      });
      for (const item of result.events) expect(validateEvent(item), JSON.stringify(validateEvent.errors)).toBe(true);
      return result;
    };
    const planned = handle("roomblock/created", "2026-07-28T09:00:00Z", [block]).events;
    expect(planned).toHaveLength(2);
    // One blocked night: from its check-in time to the next day's check-out time.
    expect(planned[0]).toMatchObject({
      type: "unit.maintenance_scheduled",
      data: {
        unit_id: "unit_204",
        starts_at: "2026-07-30T13:00:00Z",
        ends_at: "2026-07-31T09:00:00Z",
        statuses: { maintenance: "out_of_service", commercial: "not_sellable" },
      },
    });
    expect(JSON.stringify(planned)).not.toMatch(/Leaking/);
    const narrowed = handle("roomblock/details_changed", "2026-07-28T10:00:00Z", [
      { ...block, roomBlockType: "blocked_dates", rooms: [block.rooms[0]] },
    ]).events;
    expect(narrowed.map((item) => [item.type, (item.data as { statuses?: object }).statuses ?? null])).toEqual([
      ["unit.maintenance_scheduled", { commercial: "not_sellable" }],
      ["unit.maintenance_cancelled", null],
    ]);
    expect(handle("roomblock/details_changed", "2026-07-28T10:30:00Z").unmapped[0].reason).toBe("Not returned by getRoomBlocks.");
    expect(handle("roomblock/removed", "2026-07-29T08:00:00Z").events).toMatchObject([
      { type: "unit.maintenance_cancelled", data: { unit_id: "unit_204" } },
    ]);
    expect(handle("roomblock/created", "2026-07-29T09:00:00Z", [{ ...block, roomBlockType: "courtesy_hold" }]).unmapped[0].reason).toMatch(
      /courtesy hold/,
    );
  });

  it("leaves other properties and guest profiles out of HOS", () => {
    const target = adapter();
    expect(send(target, { propertyID: 999 }, {}, "2026-07-12T14:03:00Z").unmapped[0].reason).toBe(
      "The property is not configured as a HOS property.",
    );
    expect(
      target.handle({
        received_at: "2026-07-12T14:03:01Z",
        webhook: { version: "1.0", event: "guest/created", timestamp: 1783864981, propertyId: 418204 },
      }).unmapped[0].reason,
    ).toMatch(/pseudonymous guest_id/);
    expect(JSON.stringify(created(target).events)).not.toMatch(/Synthetic|example\.com/);
  });
});

import { describe, expect, it } from "vitest";

import { loadArrivalScenario } from "@/lib/hos/conformance";
import { type ApaleoAdapterConfig, type ApaleoReservation, type ApaleoUnit, type ApaleoWebhook, createApaleoAdapter } from "@/lib/hos/mappings/apaleo";
import { createIdentityRegistry } from "@/lib/hos/mappings/common";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

import { errors, validateEvent } from "./hos-schemas";

const { scenario, manifests } = loadArrivalScenario();
const recording = loadRecording("apaleo");
const config = recording.adapter as unknown as Omit<ApaleoAdapterConfig, "identities">;
const webhook = (index: number) => recording.deliveries[index].webhook as ApaleoWebhook;
const fetched = <T>(index: number) => recording.deliveries[index].fetched[0].response as T;

describe("Apaleo adapter", () => {
  const reservation = fetched<ApaleoReservation>(0);
  const assigned = fetched<ApaleoReservation>(1);
  const unit = fetched<ApaleoUnit>(2);
  const adapter = (overrides: Partial<ApaleoAdapterConfig> = {}) => createApaleoAdapter({ ...config, identities: createIdentityRegistry(recording.adapter.crosswalk), ...overrides });
  const types = (events: HosFact[]) => events.map((event) => event.type);
  const status = (event: HosFact) => event.data as { dimension?: string; previous?: string; current?: string };

  function send(target: ReturnType<typeof adapter>, type: string, change: Partial<ApaleoReservation>, at = "2026-07-20T09:00:00Z", base = reservation) {
    const result = target.handle({ received_at: at, webhook: { ...webhook(0), type, timestamp: Date.parse(at) }, reservation: { ...base, ...change } });
    for (const event of result.events) expect(validateEvent(event), errors(validateEvent)).toBe(true);
    return result;
  }

  function sense(target: ReturnType<typeof adapter>, status: Partial<ApaleoUnit["status"]>, at: string) {
    const result = target.handle({ received_at: at, webhook: { ...webhook(2), timestamp: Date.parse(at) }, unit: { ...unit, status: { ...unit.status, ...status } } });
    for (const event of result.events) expect(validateEvent(event), errors(validateEvent)).toBe(true);
    return result;
  }

  it("publishes nothing new when Apaleo redelivers a webhook", () => {
    const target = adapter();
    expect(types(send(target, "created", {}, "2026-07-12T14:03:00Z").events)).toEqual(["reservation.created", "stay.expected"]);
    const again = send(target, "created", {}, "2026-07-12T14:03:00Z");
    expect(again.events).toEqual([]);
    expect(again.unmapped).toEqual([{ event: "reservation/created", id: reservation.id, reason: "No change since the last fetch." }]);
  });

  it("gives a restarted adapter the same event ids, so HOS discards the redelivery", () => {
    const first = send(adapter(), "created", {}, "2026-07-12T14:03:00Z").events;
    const again = send(adapter(), "created", {}, "2026-07-12T14:09:00Z").events;
    expect(again.map((event) => event.id)).toEqual(first.map((event) => event.id));
    expect(replayArrivalReadiness([...first, ...again], manifests, scenario.projection).map((step) => step.disposition)).toEqual(["applied", "applied", "duplicate", "duplicate"]);
  });

  it("dates an assignment by its own event, and otherwise by the last modification", () => {
    const precise = adapter();
    send(precise, "created", {});
    expect(send(precise, "unit-assigned", assigned, "2026-07-30T06:06:00Z").events).toMatchObject([{ type: "stay.unit_assigned", time: "2026-07-30T06:06:00Z" }]);

    const inferred = adapter();
    send(inferred, "created", {});
    expect(send(inferred, "changed", { ...assigned, modified: "2026-07-30T08:30:00+02:00" }, "2026-07-30T07:00:00Z").events).toMatchObject([{ type: "stay.unit_assigned", time: "2026-07-30T06:30:00Z", hostimebasis: "modified" }]);
  });

  it("maps an unassignment and a reverted check-in to their own events, at the times Apaleo gives", () => {
    const target = adapter();
    send(target, "unit-assigned", assigned, "2026-07-30T06:06:00Z");
    const unassigned = send(target, "unit-unassigned", { ...assigned, unit: undefined, modified: "2026-07-30T09:00:00+02:00" }, "2026-07-30T07:00:00Z").events;
    expect(unassigned).toEqual([expect.objectContaining({ type: "stay.unit_unassigned", time: "2026-07-30T07:00:00Z", data: { stay_id: "stay_1042", unit_id: "unit_204" } })]);
    expect(unassigned[0]).not.toHaveProperty("hostimebasis");

    send(target, "unit-assigned", { ...assigned, modified: "2026-07-30T09:30:00+02:00" }, "2026-07-30T07:30:00Z");
    send(target, "checked-in", { ...assigned, status: "InHouse", checkInTime: "2026-07-30T12:35:00+02:00", modified: "2026-07-30T12:35:00+02:00" }, "2026-07-30T10:35:00Z");
    const reverted = send(target, "check-in-reverted", { ...assigned, status: "Confirmed", modified: "2026-07-30T12:50:00+02:00" }, "2026-07-30T10:50:00Z").events;
    expect(reverted).toEqual([expect.objectContaining({ type: "stay.check_in_reverted", time: "2026-07-30T10:50:00Z", data: { stay_id: "stay_1042", unit_id: "unit_204" } })]);
    const again = send(target, "checked-in", { ...assigned, status: "InHouse", checkInTime: "2026-07-30T13:05:00+02:00", modified: "2026-07-30T13:05:00+02:00" }, "2026-07-30T11:05:00Z").events;
    expect(again).toMatchObject([{ type: "stay.checked_in", time: "2026-07-30T11:05:00Z" }]);
  });

  it("maps cancellations and no-shows at the times Apaleo records", () => {
    const cancelled = adapter();
    send(cancelled, "created", {});
    expect(send(cancelled, "canceled", { status: "Canceled", cancellationTime: "2026-07-20T11:00:00+02:00", modified: "2026-07-20T11:00:00+02:00" }).events).toEqual([
      expect.objectContaining({ type: "reservation.cancelled", time: "2026-07-20T09:00:00Z", data: { reservation_id: "res_1042" } }),
    ]);

    const noShow = adapter();
    send(noShow, "created", {});
    expect(send(noShow, "set-to-no-show", { status: "NoShow", noShowTime: "2026-07-31T04:00:00+02:00", modified: "2026-07-31T04:00:00+02:00" }).events).toMatchObject([
      { type: "reservation.updated", time: "2026-07-31T02:00:00Z", data: { changed_fields: ["status"], status: "no_show" } },
    ]);
  });

  it("reports an amended stay as reservation.updated and a new stay.expected", () => {
    const target = adapter();
    send(target, "created", {});
    const amended = send(target, "amended", { departure: "2026-08-02T11:00:00+02:00", modified: "2026-07-20T11:00:00+02:00" }).events;
    expect(amended).toMatchObject([
      { type: "reservation.updated", data: { changed_fields: ["planned_departure_date"], planned_departure_date: "2026-08-02" } },
      { type: "stay.expected", time: "2026-07-20T09:00:00Z", data: { planned_departure_at: "2026-08-02T09:00:00Z" } },
    ]);
  });

  it("keeps occupancy, condition, maintenance and saleability on their own dimensions", () => {
    const target = adapter();
    const closed = sense(target, { condition: "Dirty", maintenance: { id: "HOSX-PAR-MNT-1", type: "OutOfOrder" } }, "2026-07-29T09:00:00Z").events;
    expect(closed.map((event) => event.data)).toEqual([
      { unit_id: "unit_204", dimension: "occupancy", current: "vacant", authority_source: "urn:hos:pms:demo" },
      { unit_id: "unit_204", dimension: "housekeeping", current: "dirty", authority_source: "urn:hos:pms:demo" },
      { unit_id: "unit_204", dimension: "maintenance", current: "out_of_service", authority_source: "urn:hos:pms:demo" },
      { unit_id: "unit_204", dimension: "commercial", current: "not_sellable", authority_source: "urn:hos:pms:demo" },
    ]);
    const reopened = sense(target, { condition: "Dirty", maintenance: undefined }, "2026-07-29T16:00:00Z").events;
    expect(reopened.map((event) => [status(event).dimension, status(event).previous, status(event).current])).toEqual([
      ["maintenance", "out_of_service", "operational"],
      ["commercial", "not_sellable", "sellable"],
    ]);
    expect(sense(target, { condition: "Dirty" }, "2026-07-29T17:00:00Z").unmapped[0].reason).toBe("No status change.");
  });

  it("reads Clean as inspected only where the property inspects", () => {
    const [inspecting] = sense(adapter(), { condition: "Clean" }, "2026-07-30T10:10:00Z").events.filter((event) => status(event).dimension === "housekeeping");
    expect(inspecting.data).toMatchObject({ current: "inspected" });
    const properties = config.properties.map((property) => ({ ...property, inspections: false }));
    const [cleaning] = sense(adapter({ properties }), { condition: "Clean" }, "2026-07-30T10:10:00Z").events.filter((event) => status(event).dimension === "housekeeping");
    expect(cleaning.data).toMatchObject({ current: "clean" });
  });

  it("leaves other accounts, other unit types and guest details out of HOS", () => {
    const target = adapter();
    const stranger = target.handle({ received_at: "2026-07-12T14:03:01Z", webhook: { ...webhook(0), accountId: "OTHER" }, reservation });
    expect(stranger.unmapped[0].reason).toBe("The property is not configured as a HOS property.");
    const parking = send(target, "created", { unitGroup: { id: "HOSX-PAR-PARK", type: "ParkingLot" } });
    expect(parking.unmapped[0].reason).toBe("Not a bedroom reservation.");
    const created = send(target, "created", {}).events;
    expect(JSON.stringify(created)).not.toMatch(/Synthetic|example\.com/);
    expect(target.handle({ received_at: "2026-07-30T00:00:00Z", webhook: { ...webhook(0), topic: "system", type: "healthcheck" } }).unmapped[0].reason).toBe("Health check.");
  });
});

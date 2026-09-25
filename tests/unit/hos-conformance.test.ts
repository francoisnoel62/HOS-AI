import { describe, expect, it } from "vitest";

import { examplesPath, listExamples, loadArrivalScenario, loadExpectedOutcome, toExpectedOutcome } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

import { errors, readJson, validateEvent, validateMaintenanceWindow, validateManifest, validateProperty, validateSituation, validateUnit } from "./hos-schemas";

const { scenario, manifests, events } = loadArrivalScenario();
const eventTypes: string[] = readJson("spec/0.1/schemas/events.schema.json").allOf[1].properties.type.enum;

describe("HOS Core 0.1", () => {
  it("defines the four independent unit status dimensions, each with unknown", () => {
    expect(validateUnit({ unit_id: "unit_204", property_id: "prop_demo", statuses: { occupancy: "unknown", housekeeping: "inspected", maintenance: "out_of_service", commercial: "not_sellable" } })).toBe(true);
    expect(validateUnit({ unit_id: "unit_204", property_id: "prop_demo", statuses: { housekeeping: "dirty" } })).toBe(false);
  });

  it("defines a maintenance window as a plan of the statuses a unit will have", () => {
    const window = readJson("spec/0.1/examples/entities/maintenance-window.json");
    expect(validateMaintenanceWindow(window), errors(validateMaintenanceWindow)).toBe(true);
    expect(validateMaintenanceWindow({ ...window, statuses: { housekeeping: "dirty" } })).toBe(false);
    expect(validateMaintenanceWindow({ ...window, reason: "because" })).toBe(false);
  });

  it("lets a Property declare the standard times of stays planned in days", () => {
    const property = readJson("spec/0.1/examples/entities/property.json");
    expect(validateProperty(property), errors(validateProperty)).toBe(true);
    expect(property).toMatchObject({ standard_check_in_time: "15:00", standard_check_out_time: "11:00" });
    expect(validateProperty({ ...property, standard_check_in_time: "3 PM" })).toBe(false);
  });
});

describe("HOS Events 0.1 published artefacts", () => {
  it.each(events.map((event, index) => [index + 1, event] as const))("delivery %i is a valid HOS event", (_delivery, event) => {
    expect(validateEvent(event), errors(validateEvent)).toBe(true);
  });

  it.each(listExamples())("example %s is a valid HOS event", (file) => {
    expect(validateEvent(readJson(`${examplesPath}/${file}`)), errors(validateEvent)).toBe(true);
  });

  it("publishes an example for every event type in the catalogue", () => {
    expect(eventTypes).toHaveLength(15);
    expect(eventTypes.filter((type) => !listExamples().includes(`${type}.json`))).toEqual([]);
  });

  it.each(manifests.map((manifest) => [manifest.producer, manifest] as const))("manifest %s is valid", (_producer, manifest) => {
    expect(validateManifest(manifest), errors(validateManifest)).toBe(true);
  });

  it("declares at most one authoritative producer per property, event type and dimension", () => {
    const claims = manifests.flatMap((manifest) =>
      manifest.events
        .filter((declaration) => declaration.authoritative)
        .flatMap((declaration) => manifest.property_ids.flatMap((property) => (declaration.dimensions ?? ["*"]).map((dimension) => `${property}|${declaration.type}|${dimension}`))),
    );
    expect(new Set(claims).size).toBe(claims.length);
  });

  it("publishes reference situations that validate against the non-normative schema", () => {
    for (const { delivery, event } of loadExpectedOutcome().situations) {
      const complete = { ...event, id: `situation-${delivery}`, hosrecordedat: event.time };
      expect(validateSituation(complete), errors(validateSituation)).toBe(true);
      expect(validateEvent(complete)).toBe(false);
    }
  });

  describe("rejects", () => {
    const [reservation] = events;
    const statusChange = events[3];
    const snapshot = events.find((event) => event.hosdatamode === "snapshot")!;
    const cases: Array<[string, unknown]> = [
      ["personal data the Core does not define", { ...reservation, data: { ...reservation.data, guest_name: "Jane Example" } }],
      ["a housekeeping value outside the Core model", { ...statusChange, data: { ...statusChange.data, current: "cleaning" } }],
      ["a snapshot without a sensitivity class", (({ hossensitivity: _omitted, ...rest }) => rest)(snapshot)],
      ["snapshot mode on a type that does not allow it", { ...reservation, hosdatamode: "snapshot", hossensitivity: "internal" }],
      ["subjects sent as an array", { ...reservation, hossubjects: ["reservation:res_1042"] }],
      ["an event without a tenant", (({ hostenant: _omitted, ...rest }) => rest)(reservation)],
      ["an extension outside an inverted domain namespace", { ...reservation, data: { ...reservation.data, extensions: { mews: { rate_plan: "BAR" } } } }],
      ["a reservation update that omits a changed field", { ...reservation, type: "reservation.updated", data: { reservation_id: "res_1042", changed_fields: ["status"] } }],
      ["an unassignment that does not name the released unit", { ...reservation, type: "stay.unit_unassigned", data: { stay_id: "stay_1042" } }],
      ["an actor named by a person's name", { ...reservation, hosactor: "user:Jane Example" }],
      ["an actor of an unknown kind", { ...reservation, hosactor: "robot:r2" }],
      ["a time basis HOS does not define", { ...reservation, hostimebasis: "estimated" }],
      ["a maintenance window that imposes no status", { ...reservation, type: "unit.maintenance_scheduled", data: { maintenance_id: "mnt_1", unit_id: "unit_204", starts_at: "2026-07-30T08:00:00Z", ends_at: "2026-07-30T12:00:00Z", statuses: {} } }],
      ["a maintenance window that claims an operational unit", { ...reservation, type: "unit.maintenance_scheduled", data: { maintenance_id: "mnt_1", unit_id: "unit_204", starts_at: "2026-07-30T08:00:00Z", ends_at: "2026-07-30T12:00:00Z", statuses: { maintenance: "operational" } } }],
    ];
    it.each(cases)("%s", (_name, event) => {
      expect(validateEvent(event)).toBe(false);
    });

    it("accepts a pseudonymous actor and a time the source only knows as a last modification", () => {
      expect(validateEvent({ ...reservation, hosactor: "user:staff_k3", hostimebasis: "modified" }), errors(validateEvent)).toBe(true);
    });

    it("accepts vendor detail under an inverted domain namespace", () => {
      expect(validateEvent({ ...reservation, data: { ...reservation.data, extensions: { "com.example.pms": { rate_plan: "BAR" } } } }), errors(validateEvent)).toBe(true);
    });
  });
});

describe("arrival-readiness reference projection", () => {
  const steps = replayArrivalReadiness(events, manifests, scenario.projection);

  it("matches the published expected outcome", () => {
    expect(toExpectedOutcome(steps, scenario)).toEqual(loadExpectedOutcome());
  });

  it("documents every delivery of the scenario", () => {
    expect(scenario.deliveries.map((item) => item.delivery)).toEqual(steps.map((step) => step.delivery));
  });

  it("covers every case of the conformance corpus", () => {
    const dispositions = new Set(steps.map((step) => step.disposition));
    for (const disposition of ["applied", "duplicate", "superseded", "non_authoritative", "undeclared_capability"] as const) expect(dispositions).toContain(disposition);
    expect(events.some((event) => event.hosdatamode === "snapshot")).toBe(true);
  });

  it("reaches the same final facts whatever the delivery order", () => {
    const summarise = (replayed: typeof steps) => {
      const { readiness, housekeeping, arrival, conflicts, latest_task, unit_id, stay_status } = replayed.at(-1)!.stays.stay_1042;
      return { readiness, housekeeping, arrival, conflicts, latest_task, unit_id, stay_status };
    };
    expect(summarise(replayArrivalReadiness([...events].reverse(), manifests, scenario.projection))).toEqual(summarise(steps));
  });

  it("ignores facts from producers without a manifest", () => {
    const stranger = { ...events[3], source: "urn:hos:housekeeping:unknown", id: "x-1" } as HosFact;
    expect(replayArrivalReadiness([stranger], manifests, scenario.projection)[0].disposition).toBe("undeclared_capability");
  });

  it("ignores snapshots from a producer that does not declare them", () => {
    const pmsSnapshot = { ...events.find((event) => event.hosdatamode === "snapshot")!, source: "urn:hos:pms:demo", id: "pms-x" } as HosFact;
    expect(replayArrivalReadiness([pmsSnapshot], manifests, scenario.projection)[0].disposition).toBe("undeclared_capability");
  });
});

describe("stay facts that undo earlier ones", () => {
  const [created, expected, assigned] = events;
  const dirty = events[3];
  const signal = events.find((event) => event.type === "guest.message.received")!;
  const checkedIn = events.find((event) => event.type === "stay.checked_in")!;
  const fact = (type: string, id: string, time: string, data: Record<string, unknown>) => ({ ...checkedIn, id, type, time, data }) as unknown as HosFact;
  const released = fact("stay.unit_unassigned", "pms-u1", "2026-07-30T07:00:00Z", { stay_id: "stay_1042", unit_id: "unit_204" });
  const replay = (stream: HosFact[]) => replayArrivalReadiness(stream, manifests, scenario.projection);

  it("releases the stay's unit, which leaves readiness unknown and an early arrival at risk", () => {
    const steps = replay([created, expected, assigned, dirty, released, signal]);
    expect(steps[4].disposition).toBe("applied");
    expect(steps[4].stays.stay_1042).toMatchObject({ unit_id: null, readiness: "unknown" });
    expect(steps[5].emitted).toMatchObject([{ type: "arrival.room_readiness_at_risk", data: { unit_id: null, housekeeping: null } }]);
  });

  it("ignores a release of a unit the stay no longer holds, and a release older than the assignment", () => {
    const moved = fact("stay.unit_assigned", "pms-u2", "2026-07-30T07:30:00Z", { stay_id: "stay_1042", unit_id: "unit_207", previous_unit_id: "unit_204", reason: "room_move" });
    const stale = fact("stay.unit_unassigned", "pms-u3", "2026-07-30T08:00:00Z", { stay_id: "stay_1042", unit_id: "unit_204" });
    const steps = replay([created, expected, assigned, moved, stale, released]);
    expect(steps.slice(4).map((step) => step.disposition)).toEqual(["superseded", "superseded"]);
    expect(steps.at(-1)!.stays.stay_1042.unit_id).toBe("unit_207");
  });

  it("makes a stay expected again when its check-in is reverted", () => {
    const reverted = fact("stay.check_in_reverted", "pms-r1", "2026-07-30T10:50:00Z", { stay_id: "stay_1042", unit_id: "unit_204" });
    const steps = replay([created, expected, assigned, checkedIn, reverted]);
    expect(steps[3].stays.stay_1042.stay_status).toBe("in_house");
    expect(steps[4].stays.stay_1042.stay_status).toBe("expected");
    expect(replay([created, expected, assigned, reverted, checkedIn]).at(-1)!.stays.stay_1042.stay_status).toBe("expected");
  });
});

describe("maintenance windows in the reference projection", () => {
  const [created, expected, assigned] = events;
  const signal = events.find((event) => event.type === "guest.message.received")!;
  const inspected = events.find((event) => event.hosdatamode === "snapshot")!;
  const pms = events.find((event) => event.type === "stay.checked_in")!;
  const window = (id: string, time: string, data: Record<string, unknown>, type = "unit.maintenance_scheduled") =>
    ({ ...pms, id, type, time, hossubjects: "unit:unit_204", data: { maintenance_id: "mnt_7", unit_id: "unit_204", ...data } }) as unknown as HosFact;
  const blocking = window("pms-m1", "2026-07-29T08:00:00Z", { starts_at: "2026-07-30T06:00:00Z", ends_at: "2026-07-30T16:00:00Z", statuses: { maintenance: "out_of_service", commercial: "not_sellable" }, reason: "repair" });
  const cancelled = window("pms-m2", "2026-07-30T07:00:00Z", {}, "unit.maintenance_cancelled");
  const replay = (stream: HosFact[]) => replayArrivalReadiness(stream, manifests, scenario.projection);
  const situations = (stream: HosFact[]) => replay(stream).flatMap((step) => step.emitted);

  it("raises a risk when a window blocks the unit at the planned check-in, even without an arrival signal", () => {
    const [risk] = situations([created, expected, assigned, blocking]);
    expect(risk).toMatchObject({
      type: "arrival.room_readiness_at_risk",
      data: { unit_id: "unit_204", expected_arrival_at: "2026-07-30T13:00:00Z", maintenance: { maintenance_id: "mnt_7", statuses: { maintenance: "out_of_service", commercial: "not_sellable" }, event_id: "pms-m1" } },
    });
    expect(risk.data.evidence).toContainEqual({ source: "urn:hos:pms:demo", id: "pms-m1" });
    expect(validateSituation({ ...risk, id: "s-1" }), errors(validateSituation)).toBe(true);
    expect(replay([created, expected, assigned, blocking]).at(-1)!.stays.stay_1042.readiness).toBe("not_ready");
  });

  it("resolves the risk as unit_available when the window is cancelled", () => {
    const [, resolved] = situations([created, expected, assigned, blocking, cancelled]);
    expect(resolved).toMatchObject({ type: "arrival.room_readiness_resolved", data: { reason: "unit_available" } });
    expect(validateSituation({ ...resolved, id: "s-2" }), errors(validateSituation)).toBe(true);
  });

  it("checks the window against when the guest is expected, not only the planned check-in", () => {
    const early = window("pms-m3", "2026-07-29T08:00:00Z", { starts_at: "2026-07-30T10:00:00Z", ends_at: "2026-07-30T11:00:00Z", statuses: { maintenance: "out_of_service" } });
    const afternoon = window("pms-m4", "2026-07-29T08:00:00Z", { starts_at: "2026-07-30T13:30:00Z", ends_at: "2026-07-30T15:00:00Z", statuses: { maintenance: "out_of_service" } });
    const ready = [created, expected, assigned, inspected, signal];
    expect(situations([...ready, early])).toMatchObject([{ type: "arrival.room_readiness_at_risk", data: { expected_arrival_at: "2026-07-30T10:30:00Z" } }]);
    expect(situations([...ready, afternoon])).toEqual([]);
  });

  it("keeps the latest plan, ignores an older cancellation and windows on other units", () => {
    const moved = window("pms-m5", "2026-07-29T12:00:00Z", { starts_at: "2026-07-31T06:00:00Z", ends_at: "2026-07-31T16:00:00Z", statuses: { maintenance: "out_of_service" } });
    const stale = window("pms-m6", "2026-07-29T07:00:00Z", {}, "unit.maintenance_cancelled");
    const steps = replay([created, expected, assigned, blocking, stale, moved]);
    expect(steps.map((step) => step.disposition).slice(3)).toEqual(["applied", "superseded", "applied"]);
    expect(steps.at(-1)!.stays.stay_1042).toMatchObject({ maintenance: null, situation: "resolved" });
    const elsewhere = { ...blocking, id: "pms-m7", data: { ...blocking.data, maintenance_id: "mnt_8", unit_id: "unit_207" } } as HosFact;
    expect(situations([created, expected, assigned, elsewhere])).toEqual([]);
  });
});

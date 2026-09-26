import { describe, expect, it } from "vitest";

import {
  type HosFact,
  toExpectedOutcome,
  validateEvent,
  validateMaintenanceWindow,
  validateManifest,
  validateProperty,
  validateSituation,
  validateUnit,
} from "../src/index.ts";
import { replayArrivalReadiness } from "../src/reference/index.ts";
import { conformanceScenarios, errors, listExamples, loadArrivalScenario, loadExpectedOutcome, loadScenario, readJson } from "./spec.ts";

const { scenario, manifests, events } = loadArrivalScenario();
const eventTypes: string[] = readJson("schemas/events.schema.json").allOf[1].properties.type.enum;

describe("HOS Core 0.1", () => {
  it("defines the four independent unit status dimensions, each with unknown", () => {
    expect(
      validateUnit({
        unit_id: "unit_204",
        property_id: "prop_demo",
        statuses: { occupancy: "unknown", housekeeping: "inspected", maintenance: "out_of_service", commercial: "not_sellable" },
      }),
    ).toBe(true);
    expect(validateUnit({ unit_id: "unit_204", property_id: "prop_demo", statuses: { housekeeping: "dirty" } })).toBe(false);
  });

  it("defines a maintenance window as a plan of the statuses a unit will have", () => {
    const window = readJson("examples/entities/maintenance-window.json");
    expect(validateMaintenanceWindow(window), errors(validateMaintenanceWindow)).toBe(true);
    expect(validateMaintenanceWindow({ ...window, statuses: { housekeeping: "dirty" } })).toBe(false);
    expect(validateMaintenanceWindow({ ...window, reason: "because" })).toBe(false);
  });

  it("lets a Property declare the standard times of stays planned in days", () => {
    const property = readJson("examples/entities/property.json");
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
    expect(validateEvent(readJson(`examples/${file}`)), errors(validateEvent)).toBe(true);
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
        .flatMap((declaration) =>
          manifest.property_ids.flatMap((property) =>
            (declaration.dimensions ?? ["*"]).map((dimension) => `${property}|${declaration.type}|${dimension}`),
          ),
        ),
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
    for (const disposition of ["applied", "duplicate", "superseded", "non_authoritative", "undeclared_capability"] as const)
      expect(dispositions).toContain(disposition);
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
  const fact = (type: string, id: string, time: string, data: Record<string, unknown>) =>
    ({ ...checkedIn, id, type, time, data }) as unknown as HosFact;
  const released = fact("stay.unit_unassigned", "pms-u1", "2026-07-30T07:00:00Z", { stay_id: "stay_1042", unit_id: "unit_204" });
  const replay = (stream: HosFact[]) => replayArrivalReadiness(stream, manifests, scenario.projection);

  it("releases the stay's unit, which leaves readiness unknown and an early arrival at risk", () => {
    const steps = replay([created, expected, assigned, dirty, released, signal]);
    expect(steps[4].disposition).toBe("applied");
    expect(steps[4].stays.stay_1042).toMatchObject({ unit_id: null, readiness: "unknown" });
    expect(steps[5].emitted).toMatchObject([{ type: "arrival.room_readiness_at_risk", data: { unit_id: null, housekeeping: null } }]);
  });

  it("ignores a release of a unit the stay no longer holds, and a release older than the assignment", () => {
    const moved = fact("stay.unit_assigned", "pms-u2", "2026-07-30T07:30:00Z", {
      stay_id: "stay_1042",
      unit_id: "unit_207",
      previous_unit_id: "unit_204",
      reason: "room_move",
    });
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
  const blocking = window("pms-m1", "2026-07-29T08:00:00Z", {
    starts_at: "2026-07-30T06:00:00Z",
    ends_at: "2026-07-30T16:00:00Z",
    statuses: { maintenance: "out_of_service", commercial: "not_sellable" },
    reason: "repair",
  });
  const cancelled = window("pms-m2", "2026-07-30T07:00:00Z", {}, "unit.maintenance_cancelled");
  const replay = (stream: HosFact[]) => replayArrivalReadiness(stream, manifests, scenario.projection);
  const situations = (stream: HosFact[]) => replay(stream).flatMap((step) => step.emitted);

  it("raises a risk when a window blocks the unit at the planned check-in, even without an arrival signal", () => {
    const [risk] = situations([created, expected, assigned, blocking]);
    expect(risk).toMatchObject({
      type: "arrival.room_readiness_at_risk",
      data: {
        unit_id: "unit_204",
        expected_arrival_at: "2026-07-30T13:00:00Z",
        maintenance: { maintenance_id: "mnt_7", statuses: { maintenance: "out_of_service", commercial: "not_sellable" }, event_id: "pms-m1" },
      },
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
    const early = window("pms-m3", "2026-07-29T08:00:00Z", {
      starts_at: "2026-07-30T10:00:00Z",
      ends_at: "2026-07-30T11:00:00Z",
      statuses: { maintenance: "out_of_service" },
    });
    const afternoon = window("pms-m4", "2026-07-29T08:00:00Z", {
      starts_at: "2026-07-30T13:30:00Z",
      ends_at: "2026-07-30T15:00:00Z",
      statuses: { maintenance: "out_of_service" },
    });
    const ready = [created, expected, assigned, inspected, signal];
    expect(situations([...ready, early])).toMatchObject([
      { type: "arrival.room_readiness_at_risk", data: { expected_arrival_at: "2026-07-30T10:30:00Z" } },
    ]);
    expect(situations([...ready, afternoon])).toEqual([]);
  });

  it("keeps the latest plan, ignores an older cancellation and windows on other units", () => {
    const moved = window("pms-m5", "2026-07-29T12:00:00Z", {
      starts_at: "2026-07-31T06:00:00Z",
      ends_at: "2026-07-31T16:00:00Z",
      statuses: { maintenance: "out_of_service" },
    });
    const stale = window("pms-m6", "2026-07-29T07:00:00Z", {}, "unit.maintenance_cancelled");
    const steps = replay([created, expected, assigned, blocking, stale, moved]);
    expect(steps.map((step) => step.disposition).slice(3)).toEqual(["applied", "superseded", "applied"]);
    expect(steps.at(-1)!.stays.stay_1042).toMatchObject({ maintenance: null, situation: "resolved" });
    const elsewhere = { ...blocking, id: "pms-m7", data: { ...blocking.data, maintenance_id: "mnt_8", unit_id: "unit_207" } } as HosFact;
    expect(situations([created, expected, assigned, elsewhere])).toEqual([]);
  });
});

describe.each(conformanceScenarios)("conformance scenario %s", (id) => {
  const corpus = loadScenario(id);
  const steps = replayArrivalReadiness(corpus.events, corpus.manifests, corpus.scenario.projection);
  const expectedOutcome = loadExpectedOutcome(id);

  it("publishes only valid events and manifests", () => {
    for (const event of corpus.events) expect(validateEvent(event), `${event.id}: ${errors(validateEvent)}`).toBe(true);
    for (const manifest of corpus.manifests) expect(validateManifest(manifest), `${manifest.producer}: ${errors(validateManifest)}`).toBe(true);
    expect(
      corpus.events.every(
        (event) => event.hosproperty === corpus.scenario.property.id && event.hospropertytimezone === corpus.scenario.property.timezone,
      ),
    ).toBe(true);
  });

  it("declares at most one authoritative producer per property, event type and dimension", () => {
    const claims = corpus.manifests.flatMap((manifest) =>
      manifest.events
        .filter((declaration) => declaration.authoritative)
        .flatMap((declaration) =>
          manifest.property_ids.flatMap((property) =>
            (declaration.dimensions ?? ["*"]).map((dimension) => `${property}|${declaration.type}|${dimension}`),
          ),
        ),
    );
    expect(new Set(claims).size).toBe(claims.length);
  });

  it("matches the published expected outcome", () => {
    expect(toExpectedOutcome(steps, corpus.scenario)).toEqual(expectedOutcome);
  });

  it("documents every delivery", () => {
    expect(corpus.scenario.deliveries.map((item) => item.delivery)).toEqual(steps.map((step) => step.delivery));
  });

  it("raises a risk, then resolves it, with situations valid against the reference schema", () => {
    expect(expectedOutcome.situations.map(({ event }) => event.type)).toEqual(["arrival.room_readiness_at_risk", "arrival.room_readiness_resolved"]);
    for (const { delivery, event } of expectedOutcome.situations) {
      expect(validateSituation({ ...event, id: `situation-${delivery}`, hosrecordedat: event.time }), errors(validateSituation)).toBe(true);
    }
  });
});

describe("maintenance and reassignment in the room-out-of-order scenario", () => {
  const { scenario: outOfOrder, manifests: lisbon, events: stream } = loadScenario("room-out-of-order");
  const replay = (facts: HosFact[]) => replayArrivalReadiness(facts, lisbon, outOfOrder.projection);
  const byId = (id: string) => stream.find((event) => event.id === id)!;

  it("names the reassignment, even when the new unit is already ready", () => {
    const ready = { ...byId("hk-005502"), id: "hk-x1", time: "2026-08-14T10:00:00Z" } as HosFact;
    const situations = replay([...stream.slice(0, 5), ready, byId("pms-020340")]).flatMap((step) => step.emitted);
    expect(situations.map((situation) => situation.type)).toEqual(["arrival.room_readiness_at_risk", "arrival.room_readiness_resolved"]);
    expect(situations[1].data).toMatchObject({ reason: "unit_reassigned", unit_id: "unit_318" });
  });

  it("lets only the declared authority plan maintenance", () => {
    const mirrored = replay([...stream.slice(0, 4), byId("pms-020322")]);
    expect(mirrored.at(-1)).toMatchObject({ disposition: "non_authoritative", emitted: [] });
    expect(mirrored.at(-1)!.stays.stay_2051).toMatchObject({ readiness: "ready", maintenance: null });
  });
});

describe("guests still in house in the late-checkout scenario", () => {
  const { scenario: turnover, manifests: toronto, events: stream } = loadScenario("late-checkout");
  const replay = (facts: HosFact[]) => replayArrivalReadiness(facts, toronto, turnover.projection);
  const byId = (id: string) => stream.find((event) => event.id === id)!;
  const lateCheckout = byId("pms-031418");
  const plan = (id: string, time: string, departure: string) =>
    ({ ...lateCheckout, id, time, data: { ...lateCheckout.data, planned_departure_at: departure } }) as HosFact;
  const atRisk = stream.slice(0, 7);

  it("keeps a unit held by another guest not ready, without a situation while that guest leaves first", () => {
    const steps = replay(stream.slice(0, 6));
    expect(steps.at(-1)!.stays.stay_3140).toMatchObject({
      readiness: "not_ready",
      situation: "none",
      occupied_by: { stay_id: "stay_3088", planned_departure_at: "2026-08-21T15:00:00Z" },
    });
    expect(steps.flatMap((step) => step.emitted)).toEqual([]);
  });

  it("resolves the risk as departure_before_arrival when the departure moves back before the arrival", () => {
    const earlier = plan("pms-x1", "2026-08-21T14:00:00Z", "2026-08-21T18:00:00Z");
    const resolved = replay([...atRisk, earlier]).at(-1)!;
    expect(resolved.emitted).toMatchObject([{ type: "arrival.room_readiness_resolved", data: { reason: "departure_before_arrival" } }]);
    expect(resolved.stays.stay_3140).toMatchObject({ readiness: "not_ready", occupied_by: { stay_id: "stay_3088" } });
  });

  it("raises the risk when the arriving guest is expected before the departure, even without a late check-out", () => {
    const message = {
      ...lateCheckout,
      id: "msg-x1",
      source: "urn:hos:messaging:demo",
      type: "guest.message.received",
      time: "2026-08-21T12:00:00Z",
      hossubjects: "message:msg_x1 stay:stay_3140",
      data: {
        message_id: "msg_x1",
        channel: "email",
        stay_id: "stay_3140",
        sensitivity: "confidential",
        signals: [{ kind: "early_arrival", expected_arrival_at: "2026-08-21T14:30:00Z" }],
      },
    } as unknown as HosFact;
    const messaging = {
      ...toronto[0],
      producer: "urn:hos:messaging:demo",
      system_role: "messaging" as const,
      events: [{ type: "guest.message.received" as const, authoritative: true }],
    };
    const steps = replayArrivalReadiness([...stream.slice(0, 6), message], [...toronto, messaging], turnover.projection);
    expect(steps.at(-1)!.emitted).toMatchObject([
      { type: "arrival.room_readiness_at_risk", data: { expected_arrival_at: "2026-08-21T14:30:00Z", occupied_by: { stay_id: "stay_3088" } } },
    ]);
  });

  it("frees the unit when the guest in house moves to another unit", () => {
    const moved = {
      ...byId("pms-031204"),
      id: "pms-x2",
      time: "2026-08-21T14:00:00Z",
      data: { stay_id: "stay_3088", unit_id: "unit_1302", previous_unit_id: "unit_1207", reason: "room_move" },
    } as HosFact;
    const resolved = replay([...atRisk, moved]).at(-1)!;
    expect(resolved.emitted).toMatchObject([
      {
        type: "arrival.room_readiness_resolved",
        data: { reason: "unit_vacated", evidence: expect.arrayContaining([{ source: "urn:hos:pms:demo", id: "pms-x2" }]) },
      },
    ]);
    expect(resolved.stays.stay_3140.occupied_by).toBeNull();
  });

  it("reaches the same final state whatever the delivery order", () => {
    const summarise = (steps: ReturnType<typeof replay>) => {
      const { readiness, unit_id, stay_status, occupied_by, housekeeping } = steps.at(-1)!.stays.stay_3140;
      return { readiness, unit_id, stay_status, occupied_by, housekeeping };
    };
    expect(summarise(replay([...stream].reverse()))).toEqual(summarise(replay(stream)));
  });
});

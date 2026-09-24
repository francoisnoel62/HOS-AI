import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { examplesPath, listExamples, loadArrivalScenario, loadExpectedOutcome, toExpectedOutcome } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

const publicDirectory = path.join(process.cwd(), "public");
const readJson = (file: string) => JSON.parse(readFileSync(path.join(publicDirectory, file), "utf8"));

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false });
addFormats(ajv);
ajv.addVocabulary(["x-hos-authority", "x-hos-boundary", "x-hos-family"]);
for (const file of ["core", "event-envelope", "events", "producer-manifest", "reference/arrival-readiness"]) ajv.addSchema(readJson(`spec/0.1/schemas/${file}.schema.json`));
const validateEvent = ajv.getSchema("urn:hos:schema:0.1:events")!;
const validateManifest = ajv.getSchema("urn:hos:schema:0.1:producer-manifest")!;
const validateSituation = ajv.getSchema("urn:hos:schema:0.1:reference:arrival-readiness")!;
const validateUnit = ajv.getSchema("urn:hos:schema:0.1:core#/$defs/Unit")!;

const { scenario, manifests, events } = loadArrivalScenario();
const eventTypes: string[] = readJson("spec/0.1/schemas/events.schema.json").allOf[1].properties.type.enum;
const errors = (validate: typeof validateEvent) => JSON.stringify(validate.errors);

describe("HOS Core 0.1", () => {
  it("defines the four independent unit status dimensions, each with unknown", () => {
    expect(validateUnit({ unit_id: "unit_204", property_id: "prop_demo", statuses: { occupancy: "unknown", housekeeping: "inspected", maintenance: "out_of_service", commercial: "not_sellable" } })).toBe(true);
    expect(validateUnit({ unit_id: "unit_204", property_id: "prop_demo", statuses: { housekeeping: "dirty" } })).toBe(false);
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
    expect(eventTypes).toHaveLength(11);
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
    ];
    it.each(cases)("%s", (_name, event) => {
      expect(validateEvent(event)).toBe(false);
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

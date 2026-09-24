import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { loadArrivalScenario, loadExpectedOutcome, toExpectedOutcome } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

function loadSchema(file: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public/spec/0.1/schemas", file), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false });
addFormats(ajv);
ajv.addVocabulary(["x-hos-entity", "x-hos-authority"]);
const validateEvent = ajv.compile(loadSchema("hos-event.schema.json"));
const validateManifest = ajv.compile(loadSchema("producer-manifest.schema.json"));

const { scenario, manifests, events } = loadArrivalScenario();

describe("HOS 0.1 published artefacts", () => {
  it.each(events.map((event, index) => [index + 1, event] as const))("delivery %i is a valid HOS event", (_delivery, event) => {
    expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it.each(manifests.map((manifest) => [manifest.producer, manifest] as const))("manifest %s is valid", (_producer, manifest) => {
    expect(validateManifest(manifest), JSON.stringify(validateManifest.errors)).toBe(true);
  });

  it("declares at most one authoritative producer per property, event type and dimension", () => {
    const claims = manifests.flatMap((manifest) =>
      manifest.events
        .filter((declaration) => declaration.authoritative)
        .flatMap((declaration) => manifest.property_ids.flatMap((property) => (declaration.dimensions ?? ["*"]).map((dimension) => `${property}|${declaration.type}|${dimension}`))),
    );
    expect(new Set(claims).size).toBe(claims.length);
  });

  it("only uses producers that publish a manifest", () => {
    const producers = new Set(manifests.map((manifest) => manifest.producer));
    expect(events.every((event) => producers.has(event.source))).toBe(true);
  });

  it("publishes situations that are valid HOS events", () => {
    for (const { delivery, event } of loadExpectedOutcome().situations) {
      const complete = { ...event, id: `situation-${delivery}`, hosrecordedat: event.time };
      expect(validateEvent(complete), JSON.stringify(validateEvent.errors)).toBe(true);
    }
  });

  it("rejects personal data that the Core does not define", () => {
    const [reservation] = events;
    expect(validateEvent({ ...reservation, data: { ...reservation.data, guest_name: "Jane Example" } })).toBe(false);
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

  it("reaches the same final facts whatever the delivery order", () => {
    const summarise = (replayed: typeof steps) => {
      const { readiness, housekeeping, arrival, conflicts, latest_task } = replayed.at(-1)!.stays.stay_1042;
      return { readiness, housekeeping, arrival, conflicts, latest_task };
    };
    expect(summarise(replayArrivalReadiness([...events].reverse(), manifests, scenario.projection))).toEqual(summarise(steps));
  });

  it("ignores facts from producers without a manifest", () => {
    const stranger: HosFact = { ...events[2], source: "urn:hos:housekeeping:unknown", id: "x-1" } as HosFact;
    const [step] = replayArrivalReadiness([stranger], manifests, scenario.projection);
    expect(step.disposition).toBe("undeclared_producer");
  });
});

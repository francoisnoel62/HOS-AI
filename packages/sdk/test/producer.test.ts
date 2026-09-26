import { describe, expect, it } from "vitest";

import { checkProducer, findDeclaration, type HosFact, type ProducerManifest } from "../src/index.ts";
import { loadArrivalScenario, streamText } from "./spec.ts";

// The producer checks, on the PMS of the arrival scenario: the facts its manifest declares, once each.

const { manifests, events } = loadArrivalScenario();
const pms = manifests.find((manifest) => manifest.producer === "urn:hos:pms:demo")!;
const facts = events.filter((event) => event.source === pms.producer && findDeclaration([pms], event));
const housekeeping = events.find((event) => event.source === "urn:hos:housekeeping:demo")!;
const errorRules = (issues: Array<{ severity?: string; rule?: string }>) =>
  issues.filter((issue) => issue.severity === "error").map((issue) => issue.rule);

describe("checkProducer", () => {
  it("passes a producer whose facts are valid, its own and declared", () => {
    const check = checkProducer({ manifest: pms, recording: streamText(facts) });
    expect(check).toMatchObject({
      valid: true,
      producer: "urn:hos:pms:demo",
      manifest: { valid: true, errors: [] },
      recording: { valid: true, events: facts.length },
    });
    expect(check.redelivery).toBeUndefined();
  });

  it("passes a redelivery of the same facts with the same ids, even recorded again", () => {
    const again = facts.map((fact) => ({ ...fact, hosrecordedat: "2026-08-01T00:00:00Z" }));
    expect(checkProducer({ manifest: pms, recording: streamText(facts), redelivery: streamText(again) })).toMatchObject({
      valid: true,
      redelivery: { valid: true, events: facts.length, repeated: facts.length },
    });
    expect(checkProducer({ manifest: pms, recording: streamText(facts), redelivery: "" })).toMatchObject({
      valid: true,
      redelivery: { events: 0, repeated: 0 },
    });
  });

  it("fails a redelivery that brings a new id or other content for an id", () => {
    const [first, second] = facts;
    const renamed = { ...first, id: `${first.id}-again` } as HosFact;
    const changed = { ...second, time: "2026-07-30T06:07:00Z" } as HosFact;
    const { valid, redelivery } = checkProducer({ manifest: pms, recording: streamText(facts), redelivery: streamText([renamed, changed]) });
    expect(valid).toBe(false);
    expect(redelivery!.issues).toMatchObject([
      {
        line: 1,
        rule: "events/at-least-once-delivery",
        message: expect.stringContaining(`${renamed.id} from urn:hos:pms:demo is not in the recording`),
      },
      { line: 2, rule: "events/immutable-facts", message: expect.stringContaining("comes back with different content (time)") },
    ]);
  });

  it("requires the manifest to state its limitations", () => {
    const { valid, manifest } = checkProducer({ manifest: { ...pms, limitations: [] }, recording: streamText(facts) });
    expect(valid).toBe(false);
    expect(manifest.errors).toMatchObject([{ path: "/limitations", rule: "events/producers" }]);
  });

  it("reports a fact under another source once, as such", () => {
    const { valid, recording } = checkProducer({ manifest: pms, recording: streamText([...facts, housekeeping]) });
    expect(valid).toBe(false);
    expect(recording.issues).toMatchObject([
      {
        line: facts.length + 1,
        path: "/source",
        rule: "events/producers",
        message: expect.stringMatching(/^source is urn:hos:housekeeping:demo, but the manifest is urn:hos:pms:demo's\./),
      },
    ]);
  });

  it("fails a fact its manifest does not declare, and an empty recording", () => {
    const undeclared = events.find((event) => event.source === pms.producer && !findDeclaration([pms], event))!;
    expect(errorRules(checkProducer({ manifest: pms, recording: streamText([undeclared]) }).recording.issues)).toEqual([
      "events/declared-capability",
    ]);
    expect(checkProducer({ manifest: pms, recording: "" }).recording.issues).toMatchObject([
      { severity: "error", message: "The recording holds no fact." },
    ]);
  });

  it("says when the manifest is not one", () => {
    const { valid, producer, manifest } = checkProducer({ manifest: facts[0], recording: streamText(facts) });
    expect({ valid, producer }).toEqual({ valid: false, producer: null });
    expect(manifest.errors[0].message).toContain("This is not a producer manifest");
  });

  it("checks what a manifest says of snapshots", () => {
    const snapshot = events.find((event) => event.hosdatamode === "snapshot")!;
    const declaring: ProducerManifest = manifests.find((manifest) => manifest.producer === snapshot.source)!;
    expect(checkProducer({ manifest: declaring, recording: streamText([snapshot]) }).valid).toBe(true);
    const silent = { ...declaring, events: declaring.events.map((declaration) => ({ ...declaration, snapshot: false })) };
    expect(errorRules(checkProducer({ manifest: silent, recording: streamText([snapshot]) }).recording.issues)).toEqual([
      "events/explicit-snapshots",
    ]);
  });
});

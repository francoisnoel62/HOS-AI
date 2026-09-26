import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validate, validateStream } from "../src/index.ts";
import { conformanceScenarios, listExamples, loadCases, loadExpectedOutcome, loadScenario, readJson, specDirectory, streamText } from "./spec.ts";

// Readable validation against the published corpus: conformance/invalid and conformance/valid, the examples and the
// scenarios.

const run = ({ document, stream, manifests }: ReturnType<typeof loadCases>[number]) => {
  if (stream) {
    const { valid, issues } = validateStream(streamText(stream), { manifests });
    return { valid, errors: issues.filter((issue) => issue.severity === "error") };
  }
  return validate(document);
};

describe("conformance/invalid", () => {
  it.each(loadCases("invalid").map((item) => [item.file, item] as const))("rejects %s on its rule", (_file, item) => {
    const { valid, errors } = run(item);
    expect(valid).toBe(false);
    expect(errors.map((error) => error.rule)).toContain(item.rule);
    for (const error of errors) expect(error.message).toMatch(/^\S.*\.$/);
  });
});

describe("conformance/valid", () => {
  it.each(loadCases("valid").map((item) => [item.file, item] as const))("accepts %s", (_file, item) => {
    const result = run(item);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("validate", () => {
  it.each(listExamples())("accepts the example %s as an event", (file) => {
    expect(validate(readJson(`examples/${file}`))).toEqual({ valid: true, kind: "event", errors: [] });
  });

  it.each(conformanceScenarios)("accepts the manifests and reference situations of %s", (id) => {
    for (const manifest of loadScenario(id).manifests) expect(validate(manifest)).toEqual({ valid: true, kind: "manifest", errors: [] });
    for (const { delivery, event } of loadExpectedOutcome(id).situations) {
      expect(validate({ ...event, id: `situation-${delivery}`, hosrecordedat: event.time })).toEqual({ valid: true, kind: "situation", errors: [] });
    }
  });

  it("says what a document that is not HOS lacks", () => {
    expect(validate([1, 2])).toMatchObject({ valid: false, kind: null, errors: [{ message: "The document is not a JSON object." }] });
    expect(validate({ id: "x" }).errors[0].message).toContain("specversion");
  });

  it("reports each problem once, with its path", () => {
    const event = readJson("examples/reservation.created.json");
    const { errors } = validate({ ...event, hostenant: undefined, data: { ...event.data, guest_name: "Jane Example", reservation_id: "res 1042" } });
    expect(errors.map((error) => [error.path, error.rule])).toEqual([
      ["/hostenant", "events/envelope"],
      ["/data/guest_name", "events/minimal-data"],
      ["/data/reservation_id", "core/opaque-identifiers"],
    ]);
  });
});

describe("validateStream", () => {
  it.each(conformanceScenarios)("accepts the events of %s, whose only issue is a duplicate", (id) => {
    const text = readFileSync(path.join(specDirectory, "conformance", id, "events.jsonl"), "utf8");
    const { valid, events, issues } = validateStream(text);
    expect(valid).toBe(true);
    expect(events).toBe(loadScenario(id).events.length);
    for (const issue of issues) expect(issue).toMatchObject({ severity: "info", rule: "events/at-least-once-delivery" });
  });

  it.each(conformanceScenarios)("finds, with the manifests of %s, the deliveries a consumer ignores as undeclared", (id) => {
    const { manifests } = loadScenario(id);
    const text = readFileSync(path.join(specDirectory, "conformance", id, "events.jsonl"), "utf8");
    const flagged = validateStream(text, { manifests }).issues.filter((issue) => issue.severity === "error").map((issue) => issue.line);
    const undeclared = loadExpectedOutcome(id)
      .deliveries.filter((delivery) => delivery.disposition === "undeclared_capability")
      .map((delivery) => delivery.delivery);
    expect(flagged).toEqual(undeclared);
  });

  it("reads CRLF line endings and counts blank lines in line numbers", () => {
    const [first, second] = loadScenario("arrival-readiness").events;
    const { valid, events, issues } = validateStream(`${JSON.stringify(first)}\r\n\r\n${JSON.stringify(second)}\r\n{`);
    expect({ valid, events }).toEqual({ valid: false, events: 2 });
    expect(issues).toMatchObject([{ line: 4, rule: "events/replay" }]);
  });

  it("treats a fact recorded again as a duplicate, not a conflict", () => {
    const [first] = loadScenario("arrival-readiness").events;
    const { valid, issues } = validateStream(streamText([first, { ...first, hosrecordedat: "2026-07-12T15:00:00Z" }]));
    expect(valid).toBe(true);
    expect(issues).toMatchObject([{ severity: "info", line: 2 }]);
  });

  it("reports a manifest that is not valid", () => {
    const [manifest] = loadScenario("arrival-readiness").manifests;
    const { valid, issues } = validateStream("", { manifests: [{ ...manifest, limitations: undefined } as never] });
    expect(valid).toBe(false);
    expect(issues[0].message).toMatch(/^Manifest urn:hos:pms:demo: limitations is missing\./);
  });
});

import { describe, expect, it } from "vitest";

import { validate, validateStream } from "../src/index.ts";
import { listExampleFilesV02, loadCasesV02, readJsonV02, streamText } from "./spec.ts";

// Readable validation of the documents of HOS Commands 0.2, against the published corpus: conformance/invalid and
// conformance/valid of public/spec/0.2, and the examples.

const run = ({ document, stream, manifests }: ReturnType<typeof loadCasesV02>[number]) => {
  if (stream) {
    const { valid, issues } = validateStream(streamText(stream), { manifests });
    return { valid, errors: issues.filter((issue) => issue.severity === "error") };
  }
  return validate(document);
};

const kinds: Record<string, string> = {
  "commands/": "command",
  approval: "approval",
  policy: "policy",
  "producer-manifest": "manifest",
};

describe("conformance/invalid of HOS 0.2", () => {
  it.each(loadCasesV02("invalid").map((item) => [item.file, item] as const))("rejects %s on its rule", (_file, item) => {
    const { valid, errors } = run(item);
    expect(valid).toBe(false);
    expect(errors.map((error) => error.rule)).toContain(item.rule);
    for (const error of errors) expect(error.message).toMatch(/^\S.*\.$/);
  });

  it("holds a case for every rule of HOS Commands 0.2", () => {
    const rules = new Set(loadCasesV02("invalid").map((item) => item.rule));
    for (const rule of [
      "commands/default-deny",
      "commands/declared-capability",
      "commands/tenant-scope",
      "commands/idempotency",
      "commands/expiry",
      "commands/approval",
      "commands/preconditions",
      "commands/source-confirmation",
      "commands/no-compensation",
      "commands/minimal-data",
      "commands/lifecycle",
      "commands/target",
      "commands/envelope",
    ])
      expect(rules, rule).toContain(rule);
  });
});

describe("conformance/valid of HOS 0.2", () => {
  it.each(loadCasesV02("valid").map((item) => [item.file, item] as const))("accepts %s", (_file, item) => {
    const result = run(item);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("validate, for HOS 0.2", () => {
  it.each(listExampleFilesV02())("accepts the example %s and says what it is", (file) => {
    const expected = Object.entries(kinds).find(([prefix]) => file.startsWith(prefix))?.[1] ?? "event";
    expect(validate(readJsonV02(`examples/${file}`))).toEqual({ valid: true, kind: expected, errors: [] });
  });

  it("says what a missing precondition protects", () => {
    const command = readJsonV02("examples/commands/stay.unit_assign.json");
    command.preconditions = command.preconditions.filter((item: { kind: string }) => item.kind !== "unit_assignment");
    const { errors } = validate(command);
    expect(errors).toEqual([
      {
        path: "/preconditions",
        message:
          "preconditions needs a unit_assignment precondition for this command type. It protects an assignment made in the meantime, such as a reassignment by the staff.",
        rule: "commands/preconditions",
      },
    ]);
  });

  it("points at the member, not at the whole precondition, when a precondition is wrong", () => {
    const command = readJsonV02("examples/commands/stay.unit_assign.json");
    command.preconditions[2].in = ["operational"];
    const { errors } = validate(command);
    expect(errors.map((error) => [error.path, error.rule])).toEqual([["/preconditions/2/in/0", "core/unit-status-model"]]);
  });

  it("explains that a command that has ended is not taken up again", () => {
    const event = readJsonV02("examples/command.status_changed.json");
    event.data = { ...event.data, previous_status: "failed", status: "executing" };
    expect(validate(event).errors).toEqual([
      {
        path: "/data/previous_status",
        message:
          'data.previous_status is "failed", a final status: a command that has ended is never taken up again, and a correction is a new command.',
        rule: "commands/no-compensation",
      },
    ]);
  });

  it("says which statuses a transition may follow", () => {
    const event = readJsonV02("examples/command.status_changed.json");
    event.data = { ...event.data, previous_status: "proposed", status: "executing" };
    expect(validate(event).errors).toEqual([
      {
        path: "/data/previous_status",
        message: 'data.previous_status is "proposed", but executing follows approved only.',
        rule: "commands/lifecycle",
      },
    ]);
  });

  it("keeps the 0.1 and 0.2 versions of an event apart", () => {
    const event = readJsonV02("examples/command.status_changed.json");
    expect(validate({ ...event, hosschemaversion: "0.1" }).errors).toContainEqual(
      expect.objectContaining({ path: "/type", rule: "events/catalogue" }),
    );
    expect(validate({ ...event, type: "stay.unit_assigned" }).errors).toContainEqual(
      expect.objectContaining({ path: "/type", rule: "events/catalogue" }),
    );
  });

  it("names the documents it recognises, with 0.2", () => {
    expect(validate({ id: "x" }).errors[0].message).toContain("hoscommandversion");
  });
});

describe("validateStream, for the facts of a command", () => {
  const manifests = ["producer-manifest.gateway.json", "producer-manifest.pms.json"].map((file) => readJsonV02(`examples/${file}`));
  const approved = readJsonV02("examples/command.status_changed.json");

  it("takes a transition as a fact: duplicate, declared status and authority", () => {
    const text = streamText([approved, approved]);
    expect(validateStream(text, { manifests })).toMatchObject({ valid: true, events: 2, issues: [{ severity: "info", line: 2 }] });
  });

  it("says that a consumer ignores a transition its producer does not declare", () => {
    const { issues } = validateStream(
      streamText([
        { ...approved, id: "gw-000043", data: { ...approved.data, previous_status: "approved", status: "executing", approval_id: undefined } },
      ]),
      { manifests },
    );
    expect(issues).toEqual([
      {
        severity: "error",
        line: 1,
        path: "/type",
        message:
          "urn:hos:gateway:demo does not declare command.status_changed (executing) at prop_demo: a consumer ignores this event (undeclared_capability).",
        rule: "events/declared-capability",
      },
    ]);
  });
});

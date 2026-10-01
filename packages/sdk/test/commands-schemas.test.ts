import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type Approval,
  type CommandEnvelope,
  type CommandStatus,
  type CommandStatusChanged,
  type HosCommand,
  type HosEventTypeV02,
  type HosFactV02,
  HOS_SPEC_VERSION,
  HOS_SPEC_VERSIONS,
  type Policy,
  type ProducerManifestV02,
  type StayUnitAssignCommand,
  validateApproval,
  validateCommand,
  validateEvent,
  validateEventV02,
  validateManifestV02,
  validatePolicy,
  type Validator,
} from "../src/index.ts";
import { examplesV02 } from "./examples.v02.generated.ts";
import { listExampleFilesV02, readJson, readJsonV02 } from "./spec.ts";

// The HOS Commands 0.2 schemas: every published example is valid and typed, and each rule the schemas hold rejects the
// documents that break it. The readable messages and the rules that span documents are the validator's, in validate.test.ts.

const example = (file: string) => structuredClone(readJsonV02(`examples/${file}`)) as Record<string, any>;
const assign = () => example("commands/stay.unit_assign.json");
const reprioritize = () => example("commands/housekeeping.task.reprioritize.json");
const message = () => example("commands/guest.message.send.json");
const transition = () => example("command.status_changed.json");

const validatorOf = (file: string): Validator =>
  file.startsWith("commands/")
    ? validateCommand
    : file.startsWith("approval")
      ? validateApproval
      : file.startsWith("policy")
        ? validatePolicy
        : file.startsWith("producer-manifest")
          ? validateManifestV02
          : validateEventV02;

describe("the HOS 0.2 examples", () => {
  it("are typed, and are the published files", () => {
    expect(Object.keys(examplesV02).sort()).toEqual(listExampleFilesV02());
    for (const [file, content] of Object.entries(examplesV02)) expect(content).toEqual(readJsonV02(`examples/${file}`));
  });

  it.each(listExampleFilesV02())("make %s valid", (file) => {
    const validate = validatorOf(file);
    expect(validate(readJsonV02(`examples/${file}`)), JSON.stringify(validate.errors)).toBe(true);
  });

  it("keep their types apart from the 0.1 ones", () => {
    expectTypeOf<HosFactV02["type"]>().toEqualTypeOf<HosEventTypeV02>();
    expectTypeOf<Extract<HosFactV02, { type: "command.status_changed" }>>().toEqualTypeOf<CommandStatusChanged>();
    expectTypeOf<HosCommand["type"]>().toEqualTypeOf<"stay.unit_assign" | "housekeeping.task.reprioritize" | "guest.message.send">();
    expectTypeOf<StayUnitAssignCommand>().toMatchTypeOf<CommandEnvelope<"stay.unit_assign", unknown>>();
    expectTypeOf<CommandStatusChanged["data"]["status"]>().toEqualTypeOf<CommandStatus>();
    expectTypeOf<Approval["decision"]>().toEqualTypeOf<"approved" | "rejected">();
    expectTypeOf<Policy["permissions"][number]["mode"]>().toEqualTypeOf<"recommend" | "approve_and_run">();
    expectTypeOf<ProducerManifestV02["commands"]>().not.toBeNever();
  });

  it("do not make a 0.2 event a 0.1 event, nor the reverse", () => {
    expect(validateEvent(transition())).toBe(false);
    expect(validateEventV02(readJsonV02("../0.1/examples/stay.unit_assigned.json"))).toBe(false);
  });

  it("write out the Core 0.1 enums its preconditions use, exactly as Core 0.1 has them", () => {
    const core = readJson("schemas/core.schema.json").$defs;
    const branches = readJsonV02("schemas/command-envelope.schema.json").properties.preconditions.items.oneOf;
    const branch = (kind: string) =>
      branches.find((item: { properties: { kind: { const: string } } }) => item.properties.kind.const === kind).properties;
    expect(branch("stay_status").in.items.enum).toEqual(core.stayStatus.enum);
    expect(branch("task_status").in.items.enum).toEqual(core.taskStatus.enum);
    expect(branch("task_priority").equals.enum).toEqual(core.taskPriority.enum);
  });

  it("list HOS 0.1 and HOS 0.2 apart", () => {
    expect(HOS_SPEC_VERSIONS).toEqual({ "0.1": "0.1.0-draft.2", "0.2": "0.2.0-draft.1" });
    expect(HOS_SPEC_VERSION).toBe(HOS_SPEC_VERSIONS["0.1"]);
  });
});

type Change = [name: string, validate: Validator, document: () => unknown];

const without = <T extends Record<string, any>>(object: T, ...names: string[]) => {
  for (const name of names) delete object[name];
  return object;
};
const precondition = (document: Record<string, any>, kind: string) => document.preconditions.find((item: { kind: string }) => item.kind === kind);

const invalid: Change[] = [
  // Commands: only the types of the first series, and what each type requires.
  ["a command type outside the first series", validateCommand, () => ({ ...assign(), type: "stay.check_in" })],
  ["a command without an idempotency key", validateCommand, () => without(assign(), "idempotency_key")],
  ["a command without evidence", validateCommand, () => ({ ...assign(), evidence: [] })],
  ["a command with a member the schema does not define", validateCommand, () => ({ ...assign(), compensation: "none" })],
  ["a requester that is the system", validateCommand, () => ({ ...assign(), requester: "system:hos" })],
  ["a requester that is a guest", validateCommand, () => ({ ...assign(), requester: "guest:guest_7q2k" })],
  ["an assignment targeting a task", validateCommand, () => ({ ...assign(), target: "task:task_5521" })],
  ["a repriorisation targeting a stay", validateCommand, () => ({ ...reprioritize(), target: "stay:stay_1042" })],
  [
    "an assignment of a stay that has started",
    validateCommand,
    () => {
      const command = assign();
      precondition(command, "stay_status").in = ["in_house"];
      return command;
    },
  ],
  [
    "an assignment that does not protect the current assignment",
    validateCommand,
    () => ({ ...assign(), preconditions: assign().preconditions.filter((item: { kind: string }) => item.kind !== "unit_assignment") }),
  ],
  [
    "an assignment on stale facts",
    validateCommand,
    () => ({ ...assign(), preconditions: assign().preconditions.filter((item: { kind: string }) => item.kind !== "facts_fresh") }),
  ],
  [
    "a precondition of another type of command",
    validateCommand,
    () => ({ ...assign(), preconditions: [...assign().preconditions, { kind: "task_priority", equals: "low" }] }),
  ],
  [
    "a housekeeping status the dimension does not have",
    validateCommand,
    () => {
      const command = assign();
      precondition(command, "unit_status").in = ["operational"];
      return command;
    },
  ],
  ["an assignment that locks the unit", validateCommand, () => ({ ...assign(), data: { ...assign().data, lock_unit: true } })],
  ["an assignment over part of a stay", validateCommand, () => ({ ...assign(), data: { ...assign().data, from: "2026-07-15" } })],
  ["a message with free text", validateCommand, () => ({ ...message(), data: { ...message().data, text: "Your room is ready." } })],
  ["a message on the phone", validateCommand, () => ({ ...message(), data: { ...message().data, channel: "phone" } })],
  [
    "a message parameter that holds an address",
    validateCommand,
    () => ({ ...message(), data: { ...message().data, parameters: { contact: "jane@example.com" } } }),
  ],
  ["a message parameter with a nested value", validateCommand, () => ({ ...message(), data: { ...message().data, parameters: { rooms: ["212"] } } })],
  ["a repriorisation to an unknown priority", validateCommand, () => ({ ...reprioritize(), data: { ...reprioritize().data, priority: "critical" } })],

  // Approvals.
  ["an approval without a digest", validateApproval, () => without(example("approval.json"), "command_digest")],
  ["an approval with a digest of another form", validateApproval, () => ({ ...example("approval.json"), command_digest: "sha-256:ABC" })],
  ["an approval that never expires", validateApproval, () => without(example("approval.json"), "expires_at")],
  ["an approval by an integration", validateApproval, () => ({ ...example("approval.json"), approver: "integration:front_office_assistant" })],
  ["an approval without a role", validateApproval, () => without(example("approval.json"), "approver_role")],
  ["an approval with another decision", validateApproval, () => ({ ...example("approval.json"), decision: "abstained" })],

  // Policies.
  [
    "a permission to run without approver roles",
    validatePolicy,
    () => ({ ...example("policy.json"), permissions: [without(example("policy.json").permissions[0], "approver_roles")] }),
  ],
  [
    "a permission to run without a validity for approvals",
    validatePolicy,
    () => ({ ...example("policy.json"), permissions: [without(example("policy.json").permissions[0], "approval_validity_seconds")] }),
  ],
  [
    "a permission for any requester at all",
    validatePolicy,
    () => ({ ...example("policy.json"), permissions: [{ ...example("policy.json").permissions[1], requesters: ["*"] }] }),
  ],
  [
    "a permission for a command outside the first series",
    validatePolicy,
    () => ({ ...example("policy.json"), permissions: [{ ...example("policy.json").permissions[1], type: "stay.check_in" }] }),
  ],
  [
    "a permission with a mode that executes alone",
    validatePolicy,
    () => ({ ...example("policy.json"), permissions: [{ ...example("policy.json").permissions[1], mode: "bounded_autonomy" }] }),
  ],

  // The lifecycle of a command, as facts.
  ["a first transition from another status", validateEventV02, () => ({ ...transition(), data: { ...transition().data, status: "proposed" } })],
  ["an approval with no approval_id", validateEventV02, () => ({ ...transition(), data: without(transition().data, "approval_id") })],
  [
    "a transition that skips the approval",
    validateEventV02,
    () => ({ ...transition(), data: { ...transition().data, status: "executing", previous_status: "proposed" } }),
  ],
  [
    "a command executed after it failed",
    validateEventV02,
    () => ({ ...transition(), data: { ...transition().data, previous_status: "failed", status: "executing" } }),
  ],
  [
    "a command cancelled while it executes",
    validateEventV02,
    () => ({ ...transition(), data: { reason: "cancelled_by_requester", ...transition().data, previous_status: "executing", status: "cancelled" } }),
  ],
  [
    "a failure with no reason",
    validateEventV02,
    () => ({ ...transition(), data: { ...without(transition().data, "approval_id"), previous_status: "executing", status: "failed" } }),
  ],
  [
    "a success that names no confirming fact",
    validateEventV02,
    () => ({ ...transition(), data: { ...without(transition().data, "approval_id"), previous_status: "executing", status: "succeeded" } }),
  ],
  ["an approval by an integration", validateEventV02, () => ({ ...transition(), hosactor: "integration:front_office_assistant" })],
  [
    "a success with a reason",
    validateEventV02,
    () => ({
      ...transition(),
      hoscausationsource: "urn:hos:pms:demo",
      hoscausationid: "pms-000413",
      data: { ...without(transition().data, "approval_id"), previous_status: "executing", status: "succeeded", reason: "suspended" },
    }),
  ],
  [
    "a refusal for a reason that only the source gives",
    validateEventV02,
    () => ({
      ...transition(),
      data: { ...without(transition().data, "approval_id"), previous_status: "proposed", status: "rejected", reason: "locked_at_source" },
    }),
  ],
  [
    "a rejection by an approver without the approval",
    validateEventV02,
    () => ({
      ...transition(),
      data: { ...without(transition().data, "approval_id"), previous_status: "pending_approval", status: "rejected", reason: "rejected_by_approver" },
    }),
  ],
  ["a snapshot of a command", validateEventV02, () => ({ ...transition(), hosdatamode: "snapshot", hossensitivity: "internal" })],
  ["a command event under the schema version of 0.1", validateEventV02, () => ({ ...transition(), hosschemaversion: "0.1" })],
  [
    "a message sent with its content",
    validateEventV02,
    () => ({ ...example("guest.message.sent.json"), data: { ...example("guest.message.sent.json").data, text: "Your room is ready." } }),
  ],
  [
    "a message sent to nobody",
    validateEventV02,
    () => ({ ...example("guest.message.sent.json"), data: without(example("guest.message.sent.json").data, "stay_id") }),
  ],
  [
    "a repriorisation with no previous priority",
    validateEventV02,
    () => ({
      ...example("housekeeping.task.reprioritized.json"),
      data: without(example("housekeeping.task.reprioritized.json").data, "previous_priority"),
    }),
  ],

  // Manifests that declare commands.
  [
    "a command declared without its confirmation",
    validateManifestV02,
    () => ({ ...example("producer-manifest.pms.json"), commands: [without(example("producer-manifest.pms.json").commands[0], "confirmation")] }),
  ],
  [
    "a command declared without its attribution",
    validateManifestV02,
    () => ({
      ...example("producer-manifest.pms.json"),
      commands: [
        {
          ...example("producer-manifest.pms.json").commands[0],
          confirmation: without(example("producer-manifest.pms.json").commands[0].confirmation, "attribution"),
        },
      ],
    }),
  ],
  [
    "a command that confirms through an event of another kind",
    validateManifestV02,
    () => ({
      ...example("producer-manifest.pms.json"),
      commands: [
        {
          ...example("producer-manifest.pms.json").commands[0],
          confirmation: { ...example("producer-manifest.pms.json").commands[0].confirmation, events: ["stay.checked_in"] },
        },
      ],
    }),
  ],
  [
    "a command that targets a guest",
    validateManifestV02,
    () => ({ ...example("producer-manifest.pms.json"), commands: [{ ...example("producer-manifest.pms.json").commands[0], targets: ["Guest"] }] }),
  ],
  [
    "a command with an idempotency window of a few seconds",
    validateManifestV02,
    () => ({
      ...example("producer-manifest.pms.json"),
      commands: [{ ...example("producer-manifest.pms.json").commands[0], idempotency_window_seconds: 5 }],
    }),
  ],
  ["a manifest that keeps the version of 0.1", validateManifestV02, () => ({ ...example("producer-manifest.pms.json"), hosmanifestversion: "0.1" })],
];

describe("the HOS 0.2 schemas reject", () => {
  it.each(invalid)("%s", (_name, validate, document) => {
    expect(validate(document()), "the schema accepted it").toBe(false);
  });
});

describe("the HOS 0.2 schemas accept", () => {
  it("a policy that permits nothing, since whatever is not permitted is refused", () => {
    expect(validatePolicy({ ...example("policy.json"), permissions: [] })).toBe(true);
  });

  it("a permission that only recommends, with no approver", () => {
    expect(validatePolicy({ ...example("policy.json"), permissions: [example("policy.json").permissions[1]] })).toBe(true);
  });

  it("a command with more preconditions than its type requires", () => {
    const command = assign();
    command.preconditions.push({ kind: "unit_status", unit_id: "unit_212", dimension: "commercial", in: ["sellable", "unknown"] });
    expect(validateCommand(command), JSON.stringify(validateCommand.errors)).toBe(true);
  });

  it("every status of the lifecycle at the place the PRD gives it", () => {
    const steps: Array<[CommandStatus | null, CommandStatus, string?]> = [
      [null, "proposed"],
      ["proposed", "pending_approval"],
      ["pending_approval", "approved"],
      ["approved", "executing"],
      ["executing", "succeeded"],
      ["proposed", "rejected", "not_permitted"],
      ["pending_approval", "rejected", "rejected_by_approver"],
      ["approved", "failed", "precondition_failed"],
      ["executing", "failed", "rejected_by_source"],
      ["proposed", "expired", "command_expired"],
      ["approved", "expired", "approval_expired"],
      ["pending_approval", "cancelled", "cancelled_by_requester"],
      ["approved", "cancelled", "suspended"],
    ];
    for (const [previous, status, reason] of steps) {
      const data = { ...transition().data, previous_status: previous, status, ...(reason ? { reason } : {}) };
      if (status !== "approved" && reason !== "rejected_by_approver") delete data.approval_id;
      if (reason === "rejected_by_approver") data.approval_id = "apr_55c1d0e9";
      const causation = status === "succeeded" ? { hoscausationsource: "urn:hos:pms:demo", hoscausationid: "pms-000413" } : {};
      expect(validateEventV02({ ...transition(), ...causation, data }), `${previous} to ${status}: ${JSON.stringify(validateEventV02.errors)}`).toBe(
        true,
      );
    }
  });
});

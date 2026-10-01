import type { Approval, CommandStatusChanged, CommandType, HosCommand, Policy, PreconditionKind, ProducerManifestV02 } from "./index.ts";
import type { ValidationError } from "./validate.ts";

// The rules of HOS Commands 0.2 that a JSON Schema cannot hold because they compare two members of a document: the target
// with the data, the expiry with the request, the unit a precondition checks with the unit a command assigns, the
// confirmation a manifest declares with the command it confirms. Each returns the errors of one document that already
// satisfies its schema. The rules that span several documents, such as an approval and its command, belong to the lifecycle.

// What each command type requires of the handler that executes it: the entity it targets, the preconditions the handler
// checks, and the fact that confirms it.
export const commandTypes: Record<
  CommandType,
  { target: "stay" | "task"; entity: "Stay" | "Task"; preconditions: PreconditionKind[]; confirmation: string }
> = {
  "stay.unit_assign": {
    target: "stay",
    entity: "Stay",
    preconditions: ["stay_status", "unit_assignment", "facts_fresh"],
    confirmation: "stay.unit_assigned",
  },
  "housekeeping.task.reprioritize": {
    target: "task",
    entity: "Task",
    preconditions: ["task_priority", "facts_fresh"],
    confirmation: "housekeeping.task.reprioritized",
  },
  "guest.message.send": { target: "stay", entity: "Stay", preconditions: ["stay_status", "facts_fresh"], confirmation: "guest.message.sent" },
};

const show = (value: unknown) => JSON.stringify(value);

export function checkCommand(command: HosCommand): ValidationError[] {
  const errors: ValidationError[] = [];
  const spec = commandTypes[command.type];
  const id = "task_id" in command.data ? command.data.task_id : command.data.stay_id;
  const expected = `${spec.target}:${id}`;
  if (command.target !== expected)
    errors.push({
      path: "/target",
      message: `target is ${show(command.target)}, but data names ${show(expected)}. A command acts on the entity it targets, and on no other.`,
      rule: "commands/target",
    });
  if (Date.parse(command.expires_at) <= Date.parse(command.requested_at))
    errors.push({
      path: "/expires_at",
      message: `expires_at ${show(command.expires_at)} is not after requested_at ${show(command.requested_at)}. A command that has already expired is never sent.`,
      rule: "commands/expiry",
    });
  command.preconditions.forEach((precondition, index) => {
    const at = `/preconditions/${index}`;
    if (command.type === "stay.unit_assign" && command.data.unit_id) {
      if (precondition.kind === "unit_status" && precondition.unit_id !== command.data.unit_id)
        errors.push({
          path: `${at}/unit_id`,
          message: `preconditions[${index}].unit_id is ${show(precondition.unit_id)}, but the command assigns ${show(command.data.unit_id)}. The readiness checked is the readiness of the unit assigned.`,
          rule: "commands/preconditions",
        });
      if (precondition.kind === "unit_assignment" && precondition.equals === command.data.unit_id)
        errors.push({
          path: `${at}/equals`,
          message: `preconditions[${index}].equals is ${show(precondition.equals)}, the unit the command assigns: the stay already has it, and there is nothing to do.`,
          rule: "commands/preconditions",
        });
    }
    if (command.type === "housekeeping.task.reprioritize" && precondition.kind === "task_priority" && precondition.equals === command.data.priority)
      errors.push({
        path: `${at}/equals`,
        message: `preconditions[${index}].equals is ${show(precondition.equals)}, the priority the command sets: the task already has it, and there is nothing to do.`,
        rule: "commands/preconditions",
      });
  });
  return errors;
}

export function checkApproval(approval: Approval): ValidationError[] {
  const errors: ValidationError[] = [];
  if (approval.expires_at && Date.parse(approval.expires_at) <= Date.parse(approval.decided_at))
    errors.push({
      path: "/expires_at",
      message: `expires_at ${show(approval.expires_at)} is not after decided_at ${show(approval.decided_at)}. An approval that has already expired authorizes nothing.`,
      rule: "commands/approval",
    });
  return errors;
}

export function checkPolicy(policy: Policy): ValidationError[] {
  const errors: ValidationError[] = [];
  const covered = new Map<string, number>();
  policy.permissions.forEach((permission, index) => {
    const properties = permission.properties ?? policy.properties;
    for (const property of properties) {
      if (!policy.properties.includes(property))
        errors.push({
          path: `/permissions/${index}/properties`,
          message: `permissions[${index}] covers ${show(property)}, which the policy does not cover. A permission never reaches beyond its policy.`,
          rule: "commands/default-deny",
        });
      const key = `${permission.type} at ${property}`;
      const other = covered.get(key);
      if (other !== undefined)
        errors.push({
          path: `/permissions/${index}`,
          message: `permissions[${index}] and permissions[${other}] both cover ${key}. A command is allowed by one permission, which says how.`,
          rule: "commands/default-deny",
        });
      else covered.set(key, index);
    }
  });
  return errors;
}

export function checkCommandManifest(manifest: ProducerManifestV02): ValidationError[] {
  const errors: ValidationError[] = [];
  const add = (path: string, message: string, rule: string) => errors.push({ path, message, rule });
  const authoritative = (type: string) => manifest.events.some((declared) => declared.type === type && declared.authoritative);
  const commands = manifest.commands ?? [];
  const seen = new Set<string>();
  commands.forEach((command, index) => {
    const at = `/commands/${index}`;
    const spec = commandTypes[command.type];
    if (seen.has(command.type))
      add(at, `commands[${index}] declares ${command.type} again. A command type is declared once.`, "commands/declared-capability");
    seen.add(command.type);
    if (command.targets.some((entity) => entity !== spec.entity) || command.targets.length !== 1)
      add(
        `${at}/targets`,
        `commands[${index}].targets is ${show(command.targets)}, but ${command.type} targets ${show([spec.entity])}.`,
        "commands/declared-capability",
      );
    const missing = spec.preconditions.filter((kind) => !command.preconditions.includes(kind));
    if (missing.length)
      add(
        `${at}/preconditions`,
        `commands[${index}] does not declare the preconditions ${command.type} requires of its handler: ${missing.join(", ")}.`,
        "commands/preconditions",
      );
    if (command.confirmation.events.length !== 1 || command.confirmation.events[0] !== spec.confirmation)
      add(
        `${at}/confirmation/events`,
        `commands[${index}] is confirmed by ${show(command.confirmation.events)}, but ${command.type} is confirmed by ${show([spec.confirmation])}: the fact of the authority that shows its effect.`,
        "commands/source-confirmation",
      );
    else if (!authoritative(spec.confirmation))
      add(
        `${at}/confirmation/events`,
        `commands[${index}] is confirmed by ${spec.confirmation}, which events does not declare authoritative. A command succeeds only on a fact of the system that is the authority.`,
        "commands/source-confirmation",
      );
  });
  const statuses = manifest.events.filter((declared) => declared.type === "command.status_changed");
  statuses.forEach((declared) => {
    if (!declared.statuses)
      add(
        `/events/${manifest.events.indexOf(declared)}/statuses`,
        "A declaration of command.status_changed names the statuses it covers: a gateway and a handler each publish their own.",
        "commands/lifecycle",
      );
  });
  if (commands.some((command) => command.authoritative)) {
    const published = new Set(statuses.filter((declared) => declared.authoritative).flatMap((declared) => declared.statuses ?? []));
    const missing = (["executing", "succeeded", "failed"] as const).filter((status) => !published.has(status));
    if (missing.length)
      add(
        "/events",
        `The handler executes commands but does not declare command.status_changed as authoritative for ${missing.join(", ")}: a handler records what it sends, what confirms it and why it fails.`,
        "commands/lifecycle",
      );
  }
  if ((commands.length || statuses.length) && manifest.retention.command_days === undefined)
    add(
      "/retention",
      "retention.command_days is missing. A system that records commands declares how long it really keeps their journal.",
      "commands/lifecycle",
    );
  return errors;
}

export function checkTransition(event: CommandStatusChanged): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!event.hossubjects.split(" ").includes(`command:${event.data.command_id}`))
    errors.push({
      path: "/hossubjects",
      message: `hossubjects does not hold command:${event.data.command_id}. A transition names the command it belongs to.`,
      rule: "commands/lifecycle",
    });
  return errors;
}

import { compiled, type ErrorObject, matches } from "./ajv.ts";
import { differences } from "./compare.ts";
import { checkApproval, checkCommand, checkCommandManifest, checkPolicy, checkTransition } from "./commands-checks.ts";
import { type AnyHosFact, type AnyProducerManifest, authority, eventStatuses, factKey, findDeclaration } from "./processing.ts";
import { schemas } from "./schemas.generated.ts";
import type { Approval, CommandStatusChanged, HosCommand, Policy, ProducerManifestV02 } from "./v02/types.generated.ts";
import { schemasV02 } from "./v02/schemas.generated.ts";

// Readable validation of HOS documents and streams, for a developer who has not read the schemas. Each error says where
// it is, what is wrong, with a sentence of the specification where one helps, and the rule it breaks when known.
//
// The rules are provisional: until the specification numbers its rules, they are named after the sections and
// principles of /docs/core, /docs/events and /docs/commands, such as events/minimal-data, core/unit-status-model or
// commands/default-deny.

export type ValidationError = { path: string; message: string; rule?: string };
export type DocumentKind = "event" | "situation" | "manifest" | "command" | "approval" | "policy";
export type ValidationResult = { valid: boolean; kind: DocumentKind | null; errors: ValidationError[] };

export type StreamIssue = ValidationError & { severity: "error" | "warning" | "info"; line: number | null };
export type StreamResult = { valid: boolean; events: number; issues: StreamIssue[] };

type Schema = {
  $id?: string;
  $ref?: string;
  $defs?: Record<string, Schema>;
  title?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  if?: Schema;
  then?: Schema;
  else?: Schema;
  enum?: unknown[];
};

const envelope = schemas["event-envelope"] as Schema;
const events = schemas.events as Schema;
const reference = schemas["reference/arrival-readiness"] as Schema;
const manifest = schemas["producer-manifest"] as Schema;
const envelopeV02 = schemasV02["event-envelope"] as Schema;
const eventsV02 = schemasV02.events as Schema;
const commandEnvelope = schemasV02["command-envelope"] as Schema;
const commands = schemasV02.command as Schema;
const approval = schemasV02.approval as Schema;
const policy = schemasV02.policy as Schema;
const manifestV02 = schemasV02["producer-manifest"] as Schema;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const show = (value: unknown) => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};
const plural = (count: number, noun: string) => `${count === 1 ? "one" : count} ${noun}${count === 1 ? "" : "s"}`;

// --- Event documents: the envelope, then the data definition an if/then entry chooses for the type ---

const typesOf = (document: Schema) => document.allOf!.find((part) => part.properties?.type?.enum)!.properties!.type.enum as string[];
const entryFor = (document: Schema, type: unknown) =>
  document.allOf!.find((part) => part.if?.properties?.type && (part.if.properties.type as { const?: unknown }).const === type);
const snapshotTypes = typesOf(events).filter((type) => entryFor(events, type)?.then?.if?.properties?.hosdatamode);

function dataDefinition(document: Schema, event: Record<string, unknown>) {
  let part = entryFor(document, event.type)?.then;
  while (part && !part.properties?.data) part = part.if ? (matches(part.if, event) ? part.then : part.else) : undefined;
  const ref = part?.properties?.data?.$ref;
  return ref ? { id: `${document.$id}${ref}`, schema: document.$defs![ref.slice("#/$defs/".length)] } : undefined;
}

// --- Readable messages ---

type Context = {
  // The schema validated, to find the description of a missing member.
  schema: Schema;
  // Where the validated value sits in the document, such as /data.
  prefix: string;
  // The rule an error falls under when no more specific rule applies.
  rule: string;
  // The rule a member the schema does not define breaks, for the closed data of events.
  closed?: string;
  // The event type whose data is validated.
  subject?: string;
  // The rules of the paths of the document, before those of events, when the document is one of HOS Commands 0.2.
  paths?: Array<[RegExp, string]>;
  // The document validated, for the messages that name its other members.
  instance?: Record<string, unknown>;
  // Whether the document is a transition of a command: its statuses follow the lifecycle.
  lifecycle?: boolean;
};

const finalStatuses = ["succeeded", "rejected", "failed", "expired", "cancelled"];

// The rules of HOS Commands 0.2 by the path of the member that breaks them.
const commandPaths: Array<[RegExp, string]> = [
  [/^\/target$/, "commands/target"],
  [/^\/type$/, "commands/default-deny"],
  [/^\/(hostenant|hosproperty)$/, "commands/tenant-scope"],
  [/^\/handler$/, "commands/declared-capability"],
  [/^\/idempotency_key$/, "commands/idempotency"],
  [/^\/(requested_at|expires_at)$/, "commands/expiry"],
  [/^\/preconditions(\/|$)/, "commands/preconditions"],
  [/^\/data(\/|$)/, "commands/minimal-data"],
];

const transitionPaths: Array<[RegExp, string]> = [
  [/^\/hosactor$/, "commands/approval"],
  [/^\/hoscausation(source|id)$/, "commands/source-confirmation"],
];

const manifestPaths: Array<[RegExp, string]> = [
  [/^\/commands\/\d+\/confirmation(\/|$)/, "commands/source-confirmation"],
  [/^\/commands\/\d+\/preconditions(\/|$)/, "commands/preconditions"],
  [/^\/commands(\/|$)/, "commands/declared-capability"],
  [/^\/events\/\d+\/statuses(\/|$)/, "commands/lifecycle"],
  [/^\/retention\/command_days$/, "commands/lifecycle"],
];

// What a precondition a command type requires protects, to say why one is missing.
const preconditionReasons: Record<string, string> = {
  stay_status: "A unit is assigned only to a stay that has not started, and a message goes to a stay whose status is known.",
  unit_assignment: "It protects an assignment made in the meantime, such as a reassignment by the staff.",
  facts_fresh: "A command is evaluated on facts that are fresh enough.",
  task_priority: "It protects a priority set in the meantime.",
};

const rulesBySchema: Array<[RegExp, string]> = [
  [/core#\/\$defs\/hosId\//, "core/opaque-identifiers"],
  [/core#\/\$defs\/externalRefs?\//, "core/external-references"],
  [/core#\/\$defs\/extensions\//, "core/extensions"],
  [/core#\/\$defs\/sensitivityClass\//, "core/sensitivity-classes"],
  [/core#\/\$defs\/(ianaTimezone|localTime)\//, "core/time"],
  [
    /core#\/\$defs\/(unitStatusDimension|unitStatuses|occupancyStatus|housekeepingStatus|maintenanceStatus|commercialStatus)\//,
    "core/unit-status-model",
  ],
  [/core#\/\$defs\/maintenanceWindowStatuses\//, "events/plans-are-not-states"],
];

const rulesByPath: Array<[RegExp, string]> = [
  [/^\/(hosactor|hostimebasis)$/, "events/honest-time-and-actor"],
  [/^\/(hosdatamode|hossensitivity)$/, "events/explicit-snapshots"],
  [/^\/type$/, "events/catalogue"],
  [/^\/data\/extensions(\/|$)/, "core/extensions"],
  [/^\/events\/\d+\/type$/, "events/catalogue"],
  [/^\/delivery\/guarantee$/, "events/at-least-once-delivery"],
  [/^\/delivery\/ordering$/, "events/no-global-order"],
  [/^\/replay(\/|$)/, "events/replay"],
];

const formats: Record<string, string> = {
  "date-time": "an RFC 3339 date and time with an offset, such as 2026-07-30T10:30:00Z",
  date: "a date such as 2026-07-30",
  uri: "a URI such as urn:hos:pms:demo",
};

const closedData =
  "Data objects are closed so that personal or commercial data cannot travel unnoticed; vendor detail goes in data.extensions under an inverted domain namespace.";

// Branches of an anyOf or oneOf that are only required lists, such as a task for a unit or a stay.
const requiredOnly = (branches: unknown) =>
  Array.isArray(branches) && branches.every((branch) => isObject(branch) && Object.keys(branch).length === 1 && Array.isArray(branch.required))
    ? branches.flatMap((branch) => branch.required as string[])
    : undefined;

function describe(error: ErrorObject, context: Context): ValidationError {
  const params = error.params as Record<string, unknown>;
  const parent = error.parentSchema as Schema | undefined;
  const member = (params.missingProperty ?? params.additionalProperty) as string | undefined;
  let path = `${context.prefix}${error.instancePath}${member === undefined ? "" : `/${member}`}`;
  // /events/0/type reads events[0].type.
  const name = () =>
    path
      ? path
          .slice(1)
          .split("/")
          .map((segment, index) => (/^\d+$/.test(segment) ? `[${segment}]` : `${index ? "." : ""}${segment}`))
          .join("")
      : "The document";
  const hint = (text: string | undefined) => (text ? ` ${text}` : "");
  let message: string;
  // A transition goes from a status to the next the lifecycle links it to, and never from an end.
  if (context.lifecycle && path === "/data/previous_status" && typeof error.data === "string") {
    const status = String(isObject(context.instance?.data) ? context.instance.data.status : "");
    const allowed = ((params.allowedValues ?? [params.allowedValue]) as unknown[]).filter((value) => typeof value === "string");
    const rule = finalStatuses.includes(error.data) ? "commands/no-compensation" : "commands/lifecycle";
    return {
      path,
      message: finalStatuses.includes(error.data)
        ? `data.previous_status is ${show(error.data)}, a final status: a command that has ended is never taken up again, and a correction is a new command.`
        : `data.previous_status is ${show(error.data)}, but ${status} follows ${allowed.length ? allowed.join(" or ") : "no status"} only.`,
      rule,
    };
  }
  switch (error.keyword) {
    case "required": {
      const conditional = error.schemaPath.includes("/then/") ? context.schema.description : undefined;
      message = `${name()} is missing.${hint(parent?.properties?.[member!]?.description ?? context.schema.properties?.[member!]?.description ?? conditional)}`;
      break;
    }
    case "additionalProperties":
      message = `${name()} is not defined${context.subject ? ` for ${context.subject}` : ""}.${context.closed ? ` ${closedData}` : ""}`;
      break;
    case "enum":
      message = `${name()} is ${show(error.data)}, not one of: ${(params.allowedValues as unknown[]).join(", ")}.${hint(parent?.description)}`;
      break;
    case "const":
      message = `${name()} is ${show(error.data)}; HOS requires ${show(params.allowedValue)}.${hint(parent?.description)}`;
      break;
    case "type": {
      const actual = error.data === null ? "null" : Array.isArray(error.data) ? "an array" : undefined;
      message = `${name()} must be ${/^[aeiou]/.test(String(params.type)) ? "an" : "a"} ${params.type}${actual ? `, not ${actual}` : ""}.${hint(parent?.description)}`;
      break;
    }
    case "pattern":
      message = `${name()} is ${show(error.data)}, which does not have the expected form ${params.pattern}.${hint(parent?.description)}`;
      break;
    case "format":
      message = `${name()} is ${show(error.data)}, which is not ${formats[String(params.format)] ?? `a valid ${params.format}`}.`;
      break;
    case "propertyNames":
      message = `${name()} has the key ${show(params.propertyName)}, which is not allowed.${hint(parent?.description)}`;
      break;
    case "minProperties":
      message = `${name()} must have at least ${plural(Number(params.limit), "member")}.${hint(parent?.description)}`;
      break;
    case "minItems":
      message = `${name()} must have at least ${plural(Number(params.limit), "item")}.${hint(parent?.description)}`;
      break;
    case "uniqueItems":
      message = `${name()} lists the same item twice.`;
      break;
    case "minLength":
      message = Number(params.limit) === 1 ? `${name()} must not be empty.` : `${name()} must have at least ${params.limit} characters.`;
      break;
    case "minimum":
    case "maximum":
      message = `${name()} must be at ${error.keyword === "minimum" ? "least" : "most"} ${params.limit}.`;
      break;
    case "dependentRequired":
      path = `${context.prefix}${error.instancePath}/${params.missingProperty}`;
      message = `${name()} is missing: it goes with ${params.property}.`;
      break;
    case "anyOf":
    case "oneOf": {
      const required = requiredOnly(error.schema);
      message = required
        ? `${name()} needs ${required.join(" or ")}.${hint(parent?.description)}`
        : `${name()} matches none of its allowed forms.${hint(parent?.description)}`;
      break;
    }
    case "contains": {
      const need = error.schema as { properties?: { kind?: { const?: string }; in?: { items?: { const?: unknown } } } };
      const kind = need.properties?.kind?.const;
      const limit = need.properties?.in?.items?.const;
      message = `${name()} needs a ${kind} precondition${limit ? ` limited to ${show(limit)}` : ""} for this command type.${hint(kind ? preconditionReasons[kind] : undefined)}`;
      break;
    }
    case "not":
      if (isObject(error.schema) && isObject(error.schema.properties) && "hosdatamode" in error.schema.properties) {
        path = `${context.prefix}${error.instancePath}/hosdatamode`;
        message = `${context.subject ?? "This type"} does not allow snapshot mode: only ${snapshotTypes.join(", ")} does.`;
      } else message = `${name()} is not allowed here.`;
      break;
    default:
      message = `${name()} ${error.message}.`;
  }
  const rule =
    rulesBySchema.find(([pattern]) => pattern.test(error.schemaPath))?.[1] ??
    context.paths?.find(([pattern]) => pattern.test(path))?.[1] ??
    rulesByPath.find(([pattern]) => pattern.test(path))?.[1] ??
    (error.keyword === "additionalProperties" ? context.closed : undefined) ??
    context.rule;
  return { path, message, rule };
}

function readable(errors: ErrorObject[], context: Context): ValidationError[] {
  // The pattern behind a propertyNames error is reported through it. An anyOf or oneOf is reported through the one
  // branch that fits the value's type, when there is one, such as the identifier of an identifier-or-null.
  const alternatives = errors.filter((error) => error.keyword === "anyOf" || error.keyword === "oneOf");
  const expanded = new Map<ErrorObject, ErrorObject[]>();
  for (const alternative of alternatives) {
    if (requiredOnly(alternative.schema)) continue;
    const branches = new Map<string, ErrorObject[]>();
    for (const error of errors) {
      if (!error.schemaPath.startsWith(`${alternative.schemaPath}/`)) continue;
      const branch = error.schemaPath.slice(alternative.schemaPath.length + 1).split("/")[0];
      branches.set(branch, [...(branches.get(branch) ?? []), error]);
    }
    // A branch of a precondition whose kind is another is not the one meant.
    const fitting = [...branches.values()].filter(
      (list) =>
        !list.some((error) => error.keyword === "const" && error.instancePath.endsWith("/kind")) && list.some((error) => error.keyword !== "type"),
    );
    if (fitting.length === 1) expanded.set(alternative, fitting[0]);
  }
  const result: ValidationError[] = [];
  const add = (error: ErrorObject) => {
    if (error.keyword === "if") return;
    const entry = describe(error, context);
    if (!result.some((known) => known.path === entry.path && known.message === entry.message)) result.push(entry);
  };
  for (const error of errors) {
    // What a contains reports of the items that do not match is not an error: the error is that none matches.
    if (error.keyword === "if" || error.schemaPath.includes("/propertyNames/") || error.schemaPath.includes("/contains/")) continue;
    if (alternatives.some((alternative) => error.schemaPath.startsWith(`${alternative.schemaPath}/`))) continue;
    for (const branchError of expanded.get(error) ?? [error]) add(branchError);
  }
  return result;
}

function check(id: string, value: unknown, context: Context) {
  const validate = compiled(id);
  return validate(value) ? [] : readable(validate.errors ?? [], context);
}

type DocumentRules = {
  // The envelope the document is first checked against, and the document that holds its types.
  envelope: Schema;
  // What an event of a type this document does not hold falls under.
  catalogue: string;
  // The rule a member of the data breaks, and the rule a member the data does not define breaks.
  data: string;
  closed?: string;
  paths?: Array<[RegExp, string]>;
  lifecycle?: boolean;
  // What the document falls under when no more specific rule applies.
  rule?: string;
};

function checkEventDocument(document: Schema, event: Record<string, unknown>, rules: DocumentRules) {
  const { envelope: head, catalogue, data: dataRule, closed, paths, lifecycle, rule = "events/envelope" } = rules;
  const errors = check(head.$id!, event, { schema: head, prefix: "", rule, paths, instance: event, lifecycle });
  if (typeof event.type === "string" && !typesOf(document).includes(event.type)) {
    errors.push({ path: "/type", message: `type is ${show(event.type)}, which is not a type of ${document.title}.`, rule: catalogue });
  } else if (isObject(event.data)) {
    const definition = dataDefinition(document, event);
    const subject = String(event.type);
    if (definition)
      errors.push(
        ...check(definition.id, event.data, {
          schema: definition.schema,
          prefix: "/data",
          rule: dataRule,
          closed,
          subject,
          instance: event,
          lifecycle,
        }),
      );
  }
  // The rules that span the envelope and the data, such as snapshot mode, show once both are valid.
  return errors.length
    ? errors
    : check(document.$id!, event, { schema: document, prefix: "", rule, subject: String(event.type), paths, instance: event, lifecycle });
}

const eventRules = (data: string): DocumentRules => ({
  envelope,
  catalogue: "events/catalogue",
  data,
  closed: data === "events/catalogue" ? "events/minimal-data" : undefined,
});

// The 0.2 events: a transition of a command is the lifecycle's, the two other events are the catalogue's.
const eventRulesV02 = (type: unknown): DocumentRules =>
  type === "command.status_changed"
    ? {
        envelope: envelopeV02,
        catalogue: "events/catalogue",
        data: "commands/lifecycle",
        closed: "events/minimal-data",
        paths: transitionPaths,
        lifecycle: true,
      }
    : { envelope: envelopeV02, catalogue: "events/catalogue", data: "events/catalogue", closed: "events/minimal-data" };

const checkWith = (
  id: string,
  document: Record<string, unknown>,
  schema: Schema,
  rule: string,
  paths: Array<[RegExp, string]> | undefined,
  closed?: string,
) => check(id, document, { schema, prefix: "", rule, paths, closed });

// Validates an event, a reference situation, a producer manifest, or a command, an approval or a policy of HOS Commands
// 0.2, recognised by its members: specversion for an event or a situation, hosmanifestversion for a manifest,
// hoscommandversion, hosapprovalversion or hospolicyversion. An event of HOS 0.2 says so in hosschemaversion.
export function validate(document: unknown): ValidationResult {
  const result = (kind: DocumentKind | null, errors: ValidationError[]) => ({ valid: errors.length === 0, kind, errors });
  // The rules that compare two members run once the document satisfies its schema.
  const rules = <T>(errors: ValidationError[], more: (document: T) => ValidationError[]) => (errors.length ? errors : more(document as T));
  if (!isObject(document)) return result(null, [{ path: "", message: "The document is not a JSON object." }]);
  if ("hoscommandversion" in document)
    return result(
      "command",
      rules<HosCommand>(
        checkEventDocument(commands, document, {
          envelope: commandEnvelope,
          catalogue: "commands/default-deny",
          data: "commands/minimal-data",
          closed: "commands/minimal-data",
          paths: commandPaths,
          rule: "commands/envelope",
        }),
        checkCommand,
      ),
    );
  if ("hosapprovalversion" in document)
    return result("approval", rules<Approval>(checkWith(approval.$id!, document, approval, "commands/approval", undefined), checkApproval));
  if ("hospolicyversion" in document)
    return result("policy", rules<Policy>(checkWith(policy.$id!, document, policy, "commands/default-deny", undefined), checkPolicy));
  if ("hosmanifestversion" in document) {
    if (document.hosmanifestversion === "0.2")
      return result(
        "manifest",
        rules<ProducerManifestV02>(checkWith(manifestV02.$id!, document, manifestV02, "events/producers", manifestPaths), checkCommandManifest),
      );
    return result("manifest", check(manifest.$id!, document, { schema: manifest, prefix: "", rule: "events/producers" }));
  }
  if ("specversion" in document) {
    if (document.hosschemaversion === "0.2")
      return result(
        "event",
        rules<CommandStatusChanged>(checkEventDocument(eventsV02, document, eventRulesV02(document.type)), (event) =>
          event.type === "command.status_changed" ? checkTransition(event) : [],
        ),
      );
    if (typesOf(reference).includes(document.type as string))
      return result("situation", checkEventDocument(reference, document, eventRules("events/reference")));
    return result("event", checkEventDocument(events, document, eventRules("events/catalogue")));
  }
  return result(null, [
    {
      path: "",
      message:
        "This is not a HOS document: an event or a situation has specversion, a manifest has hosmanifestversion, a command has hoscommandversion, an approval has hosapprovalversion and a policy has hospolicyversion.",
    },
  ]);
}

// --- Streams ---

// Validates a JSON Lines stream of events: each line, and what only a stream shows. A source and id repeated with the
// same content is a duplicate a consumer discards; with other content, an error. A property keeps one tenant and one
// time zone. With the producers' manifests, a fact they do not declare is an error, since a consumer ignores it.
export function validateStream(text: string, { manifests = [] }: { manifests?: AnyProducerManifest[] } = {}): StreamResult {
  const issues: StreamIssue[] = [];
  const report = (severity: StreamIssue["severity"], line: number | null, issue: ValidationError) => issues.push({ severity, line, ...issue });

  manifests.forEach((candidate, index) => {
    const { errors } = validate(candidate);
    for (const error of errors)
      report("error", null, {
        ...error,
        message: `Manifest ${isObject(candidate) ? (candidate.producer ?? index + 1) : index + 1}: ${error.message}`,
      });
  });
  const authorities = new Map<string, string>();
  for (const { producer, property_ids, events: declared } of manifests.filter((candidate) => validate(candidate).valid)) {
    for (const declaration of declared.filter((item) => item.authoritative)) {
      for (const property of property_ids) {
        for (const dimension of ("statuses" in declaration ? declaration.statuses : undefined) ?? declaration.dimensions ?? [undefined]) {
          const claim = `${declaration.type}${dimension ? ` (${dimension})` : ""} at ${property}`;
          const other = authorities.get(claim);
          if (other && other !== producer)
            report("error", null, {
              path: "",
              message: `${other} and ${producer} are both authoritative for ${claim}. At most one producer is authoritative for a property, event type and dimension.`,
              rule: "events/one-authority",
            });
          authorities.set(claim, producer);
        }
      }
    }
  }

  const seen = new Map<string, { line: number; event: Record<string, unknown> }>();
  const properties = new Map<string, { line: number; tenant: unknown; timezone: unknown }>();
  let count = 0;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch (error) {
      report("error", line, {
        path: "",
        message: `Not JSON: ${(error as Error).message.replace(/ \(line \d+ column \d+\)$/, "")}. A stream is JSON Lines: one event per line.`,
        rule: "events/replay",
      });
      return;
    }
    const { kind, errors } = validate(event);
    if (kind !== "event") {
      report("error", line, kind ? { path: "", message: `A ${kind}, not an event.` } : errors[0]);
      return;
    }
    count += 1;
    for (const error of errors) report("error", line, error);
    const fact = event as Record<string, unknown>;

    if (typeof fact.source === "string" && typeof fact.id === "string") {
      const key = factKey(fact as AnyHosFact);
      const first = seen.get(key);
      if (!first) seen.set(key, { line, event: fact });
      else {
        const changed = differences(first.event, fact);
        if (changed.length)
          report("error", line, {
            path: "",
            message: `Reuses the source and id of line ${first.line} with different content (${changed.join(", ")}). A source and id name one fact, which never changes: a correction is a new event.`,
            rule: "events/immutable-facts",
          });
        else
          report("info", line, {
            path: "",
            message: `Repeats line ${first.line}: same source, id and content. A consumer discards it as a duplicate.`,
            rule: "events/at-least-once-delivery",
          });
      }
    }

    if (typeof fact.hosproperty === "string") {
      const known = properties.get(fact.hosproperty);
      if (!known) properties.set(fact.hosproperty, { line, tenant: fact.hostenant, timezone: fact.hospropertytimezone });
      else {
        if (known.tenant !== fact.hostenant)
          report("error", line, {
            path: "/hostenant",
            message: `Puts ${fact.hosproperty} in tenant ${show(fact.hostenant)}, where line ${known.line} put it in ${show(known.tenant)}. A property belongs to one tenant.`,
            rule: "core/entities",
          });
        if (known.timezone !== fact.hospropertytimezone)
          report("error", line, {
            path: "/hospropertytimezone",
            message: `Gives ${fact.hosproperty} the time zone ${show(fact.hospropertytimezone)}, where line ${known.line} gave ${show(known.timezone)}. Local times derive from the property's time zone, which a stream does not change.`,
            rule: "core/time",
          });
      }
    }

    if (manifests.length && !errors.length) {
      const hos = fact as AnyHosFact;
      const dimensions = eventStatuses(hos);
      const undeclared = dimensions.filter((dimension) => authority(manifests, hos, dimension) === "undeclared_capability");
      if (undeclared.length) {
        const which = undeclared[0] ? ` (${undeclared.join(", ")})` : "";
        const snapshot = hos.hosdatamode === "snapshot" && undeclared.some((dimension) => findDeclaration(manifests, hos, dimension));
        const severity = undeclared.length === dimensions.length ? "error" : "warning";
        const ignored = severity === "error" ? "a consumer ignores this event" : "a consumer ignores these dimensions";
        report(
          severity,
          line,
          snapshot
            ? {
                path: "/hosdatamode",
                message: `${hos.source} does not declare snapshots of ${hos.type}${which} at ${hos.hosproperty}: ${ignored}.`,
                rule: "events/explicit-snapshots",
              }
            : {
                path: "/type",
                message: `${hos.source} does not declare ${hos.type}${which} at ${hos.hosproperty}: ${ignored} (undeclared_capability).`,
                rule: "events/declared-capability",
              },
        );
      }
    }
  });

  return { valid: !issues.some((issue) => issue.severity === "error"), events: count, issues };
}

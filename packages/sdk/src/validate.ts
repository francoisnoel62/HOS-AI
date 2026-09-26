import { compiled, type ErrorObject, matches } from "./ajv.ts";
import { differences } from "./compare.ts";
import { authority, factKey, findDeclaration, statusChanges } from "./processing.ts";
import { schemas } from "./schemas.generated.ts";
import type { HosFact, ProducerManifest, UnitStatusChanged } from "./types.generated.ts";

// Readable validation of HOS documents and streams, for a developer who has not read the schemas. Each error says where
// it is, what is wrong, with a sentence of the specification where one helps, and the rule it breaks when known.
//
// The rules are provisional: until the specification numbers its rules, they are named after the sections and
// principles of /docs/core and /docs/events, such as events/minimal-data or core/unit-status-model.

export type ValidationError = { path: string; message: string; rule?: string };
export type DocumentKind = "event" | "situation" | "manifest";
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
    const fitting = [...branches.values()].filter((list) => list.some((error) => error.keyword !== "type"));
    if (fitting.length === 1) expanded.set(alternative, fitting[0]);
  }
  const result: ValidationError[] = [];
  const add = (error: ErrorObject) => {
    const entry = describe(error, context);
    if (!result.some((known) => known.path === entry.path && known.message === entry.message)) result.push(entry);
  };
  for (const error of errors) {
    if (error.keyword === "if" || error.schemaPath.includes("/propertyNames/")) continue;
    if (alternatives.some((alternative) => error.schemaPath.startsWith(`${alternative.schemaPath}/`))) continue;
    for (const branchError of expanded.get(error) ?? [error]) add(branchError);
  }
  return result;
}

function check(id: string, value: unknown, context: Context) {
  const validate = compiled(id);
  return validate(value) ? [] : readable(validate.errors ?? [], context);
}

function checkEventDocument(document: Schema, event: Record<string, unknown>, dataRule: string) {
  const errors = check(envelope.$id!, event, { schema: envelope, prefix: "", rule: "events/envelope" });
  if (typeof event.type === "string" && !typesOf(document).includes(event.type)) {
    errors.push({ path: "/type", message: `type is ${show(event.type)}, which is not a type of ${document.title}.`, rule: "events/catalogue" });
  } else if (isObject(event.data)) {
    const definition = dataDefinition(document, event);
    const subject = String(event.type);
    if (definition)
      errors.push(
        ...check(definition.id, event.data, {
          schema: definition.schema,
          prefix: "/data",
          rule: dataRule,
          closed: dataRule === "events/catalogue" ? "events/minimal-data" : undefined,
          subject,
        }),
      );
  }
  // The rules that span the envelope and the data, such as snapshot mode, show once both are valid.
  return errors.length ? errors : check(document.$id!, event, { schema: document, prefix: "", rule: "events/envelope", subject: String(event.type) });
}

// Validates an event, a reference situation or a producer manifest, recognised by its members: specversion for an
// event or a situation, hosmanifestversion for a manifest.
export function validate(document: unknown): ValidationResult {
  const result = (kind: DocumentKind | null, errors: ValidationError[]) => ({ valid: errors.length === 0, kind, errors });
  if (!isObject(document)) return result(null, [{ path: "", message: "The document is not a JSON object." }]);
  if ("hosmanifestversion" in document)
    return result("manifest", check(manifest.$id!, document, { schema: manifest, prefix: "", rule: "events/producers" }));
  if ("specversion" in document) {
    if (typesOf(reference).includes(document.type as string)) return result("situation", checkEventDocument(reference, document, "events/reference"));
    return result("event", checkEventDocument(events, document, "events/catalogue"));
  }
  return result(null, [
    { path: "", message: "This is not a HOS document: an event or a situation has specversion, a manifest has hosmanifestversion." },
  ]);
}

// --- Streams ---

// Validates a JSON Lines stream of events: each line, and what only a stream shows. A source and id repeated with the
// same content is a duplicate a consumer discards; with other content, an error. A property keeps one tenant and one
// time zone. With the producers' manifests, a fact they do not declare is an error, since a consumer ignores it.
export function validateStream(text: string, { manifests = [] }: { manifests?: ProducerManifest[] } = {}): StreamResult {
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
        for (const dimension of declaration.dimensions ?? [undefined]) {
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
      const key = factKey(fact as HosFact);
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
      const hos = fact as HosFact;
      const dimensions = hos.type === "unit.status_changed" ? statusChanges(hos as UnitStatusChanged).map(([dimension]) => dimension) : [undefined];
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

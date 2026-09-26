import { differences } from "./compare.ts";
import { factKey } from "./processing.ts";
import type { HosFact, ProducerManifest } from "./types.generated.ts";
import { type StreamIssue, type StreamResult, validate, validateStream, type ValidationError } from "./validate.ts";

// The checks of an Event Producer: what a producer publishes, against the manifest it publishes. A consumer is checked
// with the conformance scenarios; a producer, with a recording of its own facts.
//
// - The manifest is valid and states its limitations.
// - Every fact of the recording is valid, published under the manifest's producer, and declared for its property.
// - No source and id name two different facts.
// - Given a redelivery, the same source data published again, for example by a restarted producer: every fact comes
//   back with the same id and the same content, so consumers discard it as a duplicate. A producer that keeps track of
//   what it published may redeliver nothing, which passes too.

export type ProducerCheck = {
  valid: boolean;
  producer: string | null;
  manifest: { valid: boolean; errors: ValidationError[] };
  recording: StreamResult;
  // repeated counts the facts already in the recording, same id and content.
  redelivery?: StreamResult & { repeated: number };
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// The valid events of a stream, with their line numbers.
function factsOf(text: string) {
  return text.split(/\r?\n/).flatMap((raw, index) => {
    if (!raw.trim()) return [];
    try {
      const document: unknown = JSON.parse(raw);
      const { kind, valid } = validate(document);
      return kind === "event" && valid ? [{ line: index + 1, fact: document as HosFact }] : [];
    } catch {
      return [];
    }
  });
}

const settle = (result: StreamResult, issues: StreamIssue[]): StreamResult => ({
  ...result,
  issues: issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
  valid: !issues.some((issue) => issue.severity === "error"),
});

export function checkProducer({ manifest, recording, redelivery }: { manifest: unknown; recording: string; redelivery?: string }): ProducerCheck {
  const checked = validate(manifest);
  const errors: ValidationError[] = checked.kind === "manifest" ? [...checked.errors] : [{ path: "", message: "This is not a producer manifest: a manifest has hosmanifestversion.", rule: "events/producers" }];
  const declared = checked.kind === "manifest" && checked.valid ? (manifest as ProducerManifest) : undefined;
  if (declared && !declared.limitations.length) {
    errors.push({
      path: "/limitations",
      message: "limitations is empty. A producer states its known gaps, unsupported states and access constraints, which the Event Producer checks require.",
      rule: "events/producers",
    });
  }
  const producer = isObject(manifest) && typeof manifest.producer === "string" ? manifest.producer : null;

  const check = (text: string) => {
    const result = validateStream(text, { manifests: declared ? [declared] : [] });
    const facts = factsOf(text);
    const issues = [...result.issues];
    const foreign = new Set<number>();
    for (const { line, fact } of producer ? facts : []) {
      if (fact.source === producer) continue;
      foreign.add(line);
      issues.push({ severity: "error", line, path: "/source", message: `source is ${fact.source}, but the manifest is ${producer}'s. A producer publishes its facts under the source its manifest declares.`, rule: "events/producers" });
    }
    // A fact under another source is reported as such, not also as undeclared.
    const kept = issues.filter((issue) => !(issue.line !== null && foreign.has(issue.line) && (issue.rule === "events/declared-capability" || issue.rule === "events/explicit-snapshots")));
    return { result: settle(result, kept), facts };
  };

  const first = check(recording);
  if (!first.result.events) first.result = settle(first.result, [...first.result.issues, { severity: "error", line: null, path: "", message: "The recording holds no fact." }]);

  let again: ProducerCheck["redelivery"];
  if (redelivery !== undefined) {
    const second = check(redelivery);
    const recorded = new Map(first.facts.map(({ fact }) => [factKey(fact), fact]));
    const issues = [...second.result.issues];
    let repeated = 0;
    for (const { line, fact } of second.facts) {
      const original = recorded.get(factKey(fact));
      const changed = original && differences(original, fact);
      if (!original)
        issues.push({
          severity: "error",
          line,
          path: "/id",
          message: `${fact.id} from ${fact.source} is not in the recording. Publishing the same data again, a producer publishes the same facts with the same ids, so consumers discard them as duplicates.`,
          rule: "events/at-least-once-delivery",
        });
      else if (changed!.length)
        issues.push({
          severity: "error",
          line,
          path: "",
          message: `${fact.id} comes back with different content (${changed!.join(", ")}). A source and id name one fact, which never changes: a correction is a new event.`,
          rule: "events/immutable-facts",
        });
      else repeated += 1;
    }
    again = { ...settle(second.result, issues), repeated };
  }

  return {
    valid: !errors.length && first.result.valid && (again?.valid ?? true),
    producer,
    manifest: { valid: !errors.length, errors },
    recording: first.result,
    ...(again ? { redelivery: again } : {}),
  };
}

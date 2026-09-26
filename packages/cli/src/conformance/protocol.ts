import type { ConformanceScenario, ExpectedOutcome, HosFact, ProducerManifest } from "@hos-ai/sdk";

// The hos-conformance/1 protocol, described in public/spec/0.1/conformance/PROTOCOL.md: what the tool writes to an
// implementation, how it reads the answer, and how it compares the answer with expected.json.

export const protocol = "hos-conformance/1";

export type Level = "normative" | "reference";
export type Scenario = { id: string; scenario: ConformanceScenario; manifests: ProducerManifest[]; events: HosFact[]; expected: ExpectedOutcome };

// One scenario line, one line per manifest, then one line per delivery.
export function input({ scenario, manifests, events }: Scenario, level: Level) {
  const lines = [
    {
      kind: "scenario",
      protocol,
      level,
      scenario: scenario.scenario,
      tenant: scenario.tenant,
      property: scenario.property,
      projection: scenario.projection,
    },
    ...manifests.map((manifest) => ({ kind: "manifest", manifest })),
    ...events.map((event, index) => ({ kind: "delivery", delivery: index + 1, event })),
  ];
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

export type Answer = { delivery: number; disposition?: unknown; stays?: unknown; situations?: unknown };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 77)}...` : text);

// Reads the implementation's output: one JSON object per line, each naming its delivery.
export function readAnswers(text: string, deliveries: number) {
  const answers = new Map<number, Answer>();
  const lines = new Map<number, number>();
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    let answer: unknown;
    try {
      answer = JSON.parse(raw);
    } catch {
      problems.push(`line ${line} of the output is not JSON: ${excerpt(raw.trim())}`);
      return;
    }
    const delivery = isObject(answer) ? answer.delivery : undefined;
    if (typeof delivery !== "number") problems.push(`line ${line} of the output names no delivery: ${excerpt(raw.trim())}`);
    else if (!Number.isInteger(delivery) || delivery < 1 || delivery > deliveries)
      problems.push(`line ${line} of the output answers delivery ${delivery}, which the scenario does not have`);
    else if (answers.has(delivery))
      problems.push(`delivery ${delivery} is answered twice, on lines ${lines.get(delivery)} and ${line} of the output`);
    else {
      answers.set(delivery, answer as Answer);
      lines.set(delivery, line);
    }
  });
  return { answers, problems };
}

export type Difference = { delivery: number; path: string; expected: unknown; actual: unknown };
export type Score = { passed: number; total: number };
export type Scores = { normative: Score; reference?: Score; situations?: Score };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

// The leaves where two values differ, with their JSON path.
function differences(expected: unknown, actual: unknown, path: string, found: Array<{ path: string; expected: unknown; actual: unknown }>) {
  if (canonical(expected) === canonical(actual)) return found;
  if (isObject(expected) && isObject(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) differences(expected[key], actual[key], `${path}.${key}`, found);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let index = 0; index < Math.max(expected.length, actual.length); index += 1)
      differences(expected[index], actual[index], `${path}[${index}]`, found);
  } else found.push({ path, expected, actual });
  return found;
}

// Compares the answers with expected.json, as its compare rule says: for every delivery the disposition and, for every
// known stay, its readiness and situation; situations on every attribute except id and hosrecordedat.
export function compare({ expected }: Scenario, answers: Map<number, Answer>, level: Level) {
  const found: Difference[] = [];
  const normative: Score = { passed: 0, total: expected.deliveries.length };
  const reference: Score = { passed: 0, total: expected.deliveries.length };
  const situations: Score = { passed: 0, total: expected.situations.length };
  for (const { delivery, disposition, stays } of expected.deliveries) {
    const answer = answers.get(delivery);
    const add = (list: Array<{ path: string; expected: unknown; actual: unknown }>) => found.push(...list.map((item) => ({ delivery, ...item })));
    const dispositionDifferences = differences(disposition, answer?.disposition, "disposition", []);
    add(dispositionDifferences);
    if (!dispositionDifferences.length) normative.passed += 1;
    if (level === "normative") continue;

    const stayDifferences = differences(stays, answer?.stays, "stays", []);
    add(stayDifferences);
    if (!stayDifferences.length) reference.passed += 1;

    const raised = expected.situations.filter((situation) => situation.delivery === delivery).map((situation) => situation.event);
    const received = Array.isArray(answer?.situations)
      ? answer.situations.map((situation) => (isObject(situation) ? { ...situation, id: undefined, hosrecordedat: undefined } : situation))
      : answer?.situations;
    if (!Array.isArray(received)) {
      add(differences(raised, received, "situations", []));
      continue;
    }
    for (let index = 0; index < Math.max(raised.length, received.length); index += 1) {
      const situationDifferences = differences(raised[index], received[index], `situations[${index}]`, []);
      add(situationDifferences);
      if (index < raised.length && !situationDifferences.length) situations.passed += 1;
    }
  }
  const scores: Scores = level === "normative" ? { normative } : { normative, reference, situations };
  return { scores, differences: found, passed: found.length === 0 };
}

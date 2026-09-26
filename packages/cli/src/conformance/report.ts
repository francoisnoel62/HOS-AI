import { plural } from "../format.ts";
import type { Run } from "./implementation.ts";
import { compare, type Difference, type Level, protocol, readAnswers, type Scenario, type Scores } from "./protocol.ts";

// The verdict on one scenario, and the reports: readable, JSON and JUnit.

export type Verdict = { scenario: string; level: Level; passed: boolean; scores: Scores; differences: Difference[]; problem?: string; stderr?: string; hint?: string };

const tail = (text: string, count = 20) => text.trimEnd().split(/\r?\n/).slice(-count).join("\n");
const show = (value: unknown) => {
  if (value === undefined) return "nothing";
  const text = JSON.stringify(value);
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
};

export function verdictOf(scenario: Scenario, run: Run, level: Level, timeoutSeconds: number): Verdict {
  const { answers, problems } = readAnswers(run.stdout, scenario.events.length);
  const { scores, differences, passed } = compare(scenario, answers, level);
  const problem = run.error
    ? `could not start the implementation: ${run.error}`
    : run.timedOut
      ? `the implementation did not finish within ${timeoutSeconds} s`
      : run.code !== 0
        ? `the implementation exited with code ${run.code}`
        : problems.length
          ? `${problems[0]}${problems.length > 1 ? ` (and ${plural(problems.length - 1, "more problem")})` : ""}`
          : answers.size === 0
            ? "the implementation answered no delivery"
            : undefined;
  // An implementation of the normative level only answers dispositions.
  const dispositionsOnly = level === "reference" && answers.size > 0 && [...answers.values()].every((answer) => answer.stays === undefined && answer.situations === undefined);
  const hint = dispositionsOnly ? "no answer has stays or situations: an implementation of the normative level runs with --level normative" : undefined;
  return { scenario: scenario.id, level, passed: passed && !problem, scores, differences, ...(problem ? { problem, stderr: tail(run.stderr) } : {}), ...(hint ? { hint } : {}) };
}

export const scoreText = ({ normative, reference, situations }: Scores) =>
  [`normative ${normative.passed}/${normative.total}`, reference && `reference ${reference.passed}/${reference.total}`, situations && `situations ${situations.passed}/${situations.total}`].filter(Boolean).join(" · ");

function deliveryLabel(scenario: Scenario, delivery: number) {
  const expected = scenario.expected.deliveries.find((item) => item.delivery === delivery);
  return expected ? `delivery ${delivery} (${expected.id} from ${expected.source})` : `delivery ${delivery}`;
}

export function humanReport(verdicts: Verdict[], scenarios: Map<string, Scenario>, level: Level, limit = 40) {
  const lines: string[] = [];
  for (const verdict of verdicts) {
    lines.push(`${verdict.passed ? "✓" : "✗"} ${verdict.scenario}: ${verdict.problem ?? scoreText(verdict.scores)}`);
    if (verdict.problem) {
      if (verdict.stderr) lines.push("    standard error, last lines:", ...verdict.stderr.split("\n").map((line) => `      | ${line}`));
      continue;
    }
    if (verdict.hint) lines.push(`    ${verdict.hint}`);
    let shown = 0;
    let previous: number | undefined;
    for (const difference of verdict.differences) {
      if (shown === limit) {
        lines.push(`    ... and ${plural(verdict.differences.length - limit, "more difference")}; --json lists them all`);
        break;
      }
      if (difference.delivery !== previous) lines.push(`    ${deliveryLabel(scenarios.get(verdict.scenario)!, difference.delivery)}`);
      previous = difference.delivery;
      lines.push(`      ${difference.path}: expected ${show(difference.expected)}, got ${show(difference.actual)}`);
      shown += 1;
    }
  }
  const passed = verdicts.filter((verdict) => verdict.passed).length;
  lines.push("", `${plural(verdicts.length, "scenario")}: ${passed} passed, ${verdicts.length - passed} failed · level ${level} · protocol ${protocol}`);
  return `${lines.join("\n")}\n`;
}

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// One test suite per scenario and one test case per delivery, for the CI of an implementer.
export function junitReport(verdicts: Verdict[], scenarios: Map<string, Scenario>) {
  const suites = verdicts.map((verdict) => {
    const scenario = scenarios.get(verdict.scenario)!;
    if (verdict.problem) {
      return `  <testsuite name="${xml(verdict.scenario)}" tests="1" failures="0" errors="1">\n    <testcase classname="${xml(verdict.scenario)}" name="run"><error message="${xml(verdict.problem)}">${xml(verdict.stderr ?? "")}</error></testcase>\n  </testsuite>`;
    }
    const cases = scenario.expected.deliveries.map(({ delivery }) => {
      const found = verdict.differences.filter((difference) => difference.delivery === delivery);
      const name = `classname="${xml(verdict.scenario)}" name="${xml(deliveryLabel(scenario, delivery))}"`;
      if (!found.length) return `    <testcase ${name}/>`;
      const details = found.map((difference) => `${difference.path}: expected ${show(difference.expected)}, got ${show(difference.actual)}`);
      return `    <testcase ${name}><failure message="${xml(details[0])}">${xml(details.join("\n"))}</failure></testcase>`;
    });
    const failures = cases.filter((item) => item.includes("<failure")).length;
    return `  <testsuite name="${xml(verdict.scenario)}" tests="${cases.length}" failures="${failures}" errors="0">\n${cases.join("\n")}\n  </testsuite>`;
  });
  const failed = verdicts.filter((verdict) => !verdict.passed).length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="hos conformance" tests="${verdicts.length}" failures="${failed}">\n${suites.join("\n")}\n</testsuites>\n`;
}

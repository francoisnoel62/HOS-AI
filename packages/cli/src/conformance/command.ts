import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { loadExpectedOutcome, loadScenario } from "@hos-ai/sdk/node";

import { plural } from "../format.ts";
import { exit, type Io } from "../io.ts";
import { scenarios as embedded } from "../scenarios.generated.ts";
import { runImplementation } from "./implementation.ts";
import { producerCommand } from "./producer.ts";
import { input, type Level, protocol, type Scenario } from "./protocol.ts";
import { humanReport, junitReport, verdictOf } from "./report.ts";

// hos conformance: list the scenarios, run them through a consumer written in any language, and check a producer.

export const conformanceUsage = `Usage: hos conformance list [--scenario-dir <dir>]
       hos conformance run <scenario...> --impl <command> [options]
       hos conformance run --all --impl <command> [options]
       hos conformance producer --manifest <file> --stream <file.jsonl> [--redelivery <file.jsonl>]

run replays the HOS 0.1 conformance scenarios through a consumer, in any language, and compares what it answers
with expected.json. The consumer reads a scenario on standard input and answers on standard output, as the
protocol ${protocol} describes: PROTOCOL.md, next to the published conformance scenarios.

producer checks what a producer publishes against its manifest: a valid manifest that states its limitations;
valid facts, under the manifest's producer, declared for their property; no source and id naming two facts; and,
given a redelivery of the same data, the same facts with the same ids.

Options of run:
      --impl <command>      the implementation to test, run through the shell once per scenario
      --all                 run every scenario
      --level <level>       reference, the default: dispositions, readiness and situations;
                            normative: dispositions only, which HOS Events 0.1 requires
      --timeout <seconds>   how long the implementation may take per scenario (default 30)
      --scenario-dir <dir>  a scenario directory, or a directory of scenarios, instead of the embedded ones
      --json                print the results as JSON
      --junit <file>        also write a JUnit report, for a CI

Options of producer:
      --manifest <file>     the producer's manifest
      --stream <file>       a recording of the facts it published, one per line
      --redelivery <file>   the facts it published again from the same data, for example after a restart
      --json                print the results as JSON

  -h, --help                show this help

Exit codes: 0 when every check passes, 1 when one fails, 2 for a usage or read error.
`;

// A scenario directory, or a directory of scenario directories, each with its scenario.json.
function localScenarios(directory: string): Scenario[] {
  const load = (folder: string) => {
    const { scenario, manifests, events } = loadScenario(folder);
    return { id: scenario.scenario, scenario, manifests, events, expected: loadExpectedOutcome(folder) };
  };
  if (existsSync(path.join(directory, "scenario.json"))) return [load(directory)];
  return readdirSync(directory)
    .filter((entry) => existsSync(path.join(directory, entry, "scenario.json")))
    .sort()
    .map((entry) => load(path.join(directory, entry)));
}

export async function conformanceCommand(args: string[], io: Io): Promise<number> {
  const usageError = (message: string) => {
    io.stderr(`hos conformance: ${message}\nRun hos conformance --help for usage.\n`);
    return exit.usage;
  };
  let options;
  try {
    options = parseArgs({
      args,
      allowPositionals: true,
      options: {
        impl: { type: "string" },
        all: { type: "boolean" },
        level: { type: "string", default: "reference" },
        timeout: { type: "string", default: "30" },
        "scenario-dir": { type: "string" },
        json: { type: "boolean" },
        junit: { type: "string" },
        manifest: { type: "string" },
        stream: { type: "string" },
        redelivery: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return usageError((error as Error).message);
  }
  const { values, positionals } = options;
  const [subcommand, ...names] = positionals;
  if (values.help || !subcommand) {
    (values.help ? io.stdout : io.stderr)(conformanceUsage);
    return values.help ? exit.ok : exit.usage;
  }
  if (subcommand === "producer") return producerCommand(values, io);

  let scenarios: Scenario[];
  try {
    scenarios = values["scenario-dir"] ? localScenarios(path.resolve(io.cwd, values["scenario-dir"])) : Object.entries(embedded).map(([id, scenario]) => ({ id, ...scenario }));
  } catch (error) {
    return usageError(`cannot read the scenarios in ${values["scenario-dir"]}: ${(error as Error).message}`);
  }
  if (!scenarios.length) return usageError(`${values["scenario-dir"]} holds no scenario: a scenario directory has a scenario.json.`);

  if (subcommand === "list") {
    const width = Math.max(...scenarios.map((item) => item.id.length));
    io.stdout(`${scenarios.map((item) => `${item.id.padEnd(width)}  ${item.scenario.title} · ${plural(item.events.length, "delivery")}, ${plural(item.manifests.length, "producer")}`).join("\n")}\n`);
    return exit.ok;
  }
  if (subcommand !== "run") return usageError(`unknown subcommand ${subcommand}: use list, run or producer.`);

  const level = values.level as Level;
  if (level !== "normative" && level !== "reference") return usageError(`--level is ${level}; use normative or reference.`);
  const timeout = Number(values.timeout);
  if (!(timeout > 0)) return usageError(`--timeout is ${values.timeout}; give a number of seconds.`);
  if (!values.impl) return usageError("name the implementation to test with --impl, for example --impl \"python impl.py\".");
  const known = new Map(scenarios.map((item) => [item.id, item]));
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length) return usageError(`no scenario ${unknown.join(", ")}. The scenarios are ${[...known.keys()].join(", ")}.`);
  const selected = values.all ? scenarios : names.map((name) => known.get(name)!);
  if (!selected.length) return usageError("name the scenarios to run, or use --all.");

  const verdicts = [];
  for (const scenario of selected) {
    const run = await runImplementation(values.impl, input(scenario, level), { cwd: io.cwd, timeoutMs: timeout * 1000 });
    verdicts.push(verdictOf(scenario, run, level, timeout));
  }
  const passed = verdicts.every((verdict) => verdict.passed);
  if (values.junit) await io.writeFile(values.junit, junitReport(verdicts, known));
  io.stdout(values.json ? `${JSON.stringify({ protocol, level, passed, scenarios: verdicts }, null, 2)}\n` : humanReport(verdicts, known, level));
  return passed ? exit.ok : exit.invalid;
}

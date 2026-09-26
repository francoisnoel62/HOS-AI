import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { input, protocol } from "../src/conformance/protocol.ts";
import { scenarios } from "../src/scenarios.generated.ts";
import { hos } from "./run.ts";

// hos conformance against the reference implementation, fake implementations that must fail with a clear message, and
// the Python example of the normative level.

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const node = (script: string, ...args: string[]) => [`"${process.execPath}"`, "--conditions=@hos-ai/source", `"${script}"`, ...args].join(" ");
const referenceImpl = node(path("../src/bin.ts"), "reference-impl");
const fake = (name: string) => node(path(`./fixtures/${name}.mjs`));

const python = ["python3", "python"].find((command) => {
  try {
    return /Python 3\.(1[1-9]|[2-9]\d)/.test(execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return false;
  }
});

describe("hos conformance", () => {
  it("lists the embedded scenarios", async () => {
    const { code, stdout } = await hos(["conformance", "list"]);
    expect(code).toBe(0);
    expect(stdout).toMatchSnapshot();
  });

  it("writes the protocol's input: the scenario, the manifests, then the deliveries", () => {
    const scenario = { id: "arrival-readiness", ...scenarios["arrival-readiness"] };
    const lines = input(scenario, "normative").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(lines[0]).toEqual({ kind: "scenario", protocol, level: "normative", scenario: "arrival-readiness", tenant: { id: "tenant_demo" }, property: scenario.scenario.property, projection: scenario.scenario.projection });
    expect(lines.slice(1, 4).map((line) => [line.kind, line.manifest.producer])).toEqual(scenario.manifests.map((manifest) => ["manifest", manifest.producer]));
    expect(lines.slice(4)).toEqual(scenario.events.map((event, index) => ({ kind: "delivery", delivery: index + 1, event })));
  });

  it("passes the reference implementation on every scenario", async () => {
    const { code, stdout } = await hos(["conformance", "run", "--all", "--impl", referenceImpl]);
    expect(code).toBe(0);
    expect(stdout).toMatchSnapshot();
    const normative = await hos(["conformance", "run", "arrival-readiness", "--level", "normative", "--impl", referenceImpl]);
    expect(normative).toMatchObject({ code: 0, stdout: expect.stringContaining("✓ arrival-readiness: normative 13/13\n") });
  }, 60_000);

  it("names the delivery, the path, the expected value and the one received", async () => {
    const { code, stdout } = await hos(["conformance", "run", "arrival-readiness", "--impl", fake("no-dedup")]);
    expect(code).toBe(1);
    expect(stdout).toMatchSnapshot();
  }, 30_000);

  it.each([
    ["crashes, and shows its standard error", "crash", "✗ arrival-readiness: the implementation exited with code 3\n    standard error, last lines:\n      | reading the scenario\n"],
    ["writes something other than JSON", "garbage", "✗ arrival-readiness: line 1 of the output is not JSON: hello world (and 1 more problem)\n"],
    ["answers nothing", "silent", "✗ arrival-readiness: the implementation answered no delivery\n"],
  ])("fails an implementation that %s", async (_case, name, message) => {
    const { code, stdout } = await hos(["conformance", "run", "arrival-readiness", "--impl", fake(name)]);
    expect(code).toBe(1);
    expect(stdout).toContain(message);
  }, 30_000);

  it("stops an implementation that does not finish in time", async () => {
    const started = Date.now();
    const { code, stdout } = await hos(["conformance", "run", "arrival-readiness", "--timeout", "2", "--impl", fake("slow")]);
    expect(code).toBe(1);
    expect(stdout).toContain("✗ arrival-readiness: the implementation did not finish within 2 s");
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it("writes JSON and a JUnit report for a CI", async () => {
    const { code, stdout, written } = await hos(["conformance", "run", "arrival-readiness", "--json", "--junit", "report.xml", "--impl", fake("no-dedup")]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ protocol, level: "reference", passed: false, scenarios: [{ scenario: "arrival-readiness", passed: false, scores: { normative: { passed: 12, total: 13 } } }] });
    expect(report.scenarios[0].differences).toEqual([{ delivery: 5, path: "disposition", expected: "duplicate", actual: "applied" }]);
    expect(written["report.xml"]).toContain('<testsuite name="arrival-readiness" tests="13" failures="1" errors="0">');
    expect(written["report.xml"]).toContain('<failure message="disposition: expected &quot;duplicate&quot;, got &quot;applied&quot;">');
  }, 30_000);

  it("runs a local scenario, or a directory of scenarios", async () => {
    expect((await hos(["conformance", "list", "--scenario-dir", "conformance"])).stdout.trimEnd().split("\n")).toHaveLength(3);
    const { code, stdout } = await hos(["conformance", "run", "--all", "--scenario-dir", "conformance/late-checkout", "--impl", referenceImpl]);
    expect(code).toBe(0);
    expect(stdout).toContain("✓ late-checkout: normative 15/15 · reference 15/15 · situations 2/2\n\n1 scenario: 1 passed");
  }, 30_000);

  it.skipIf(!python)("gives the Python example of the normative level its verdict", async () => {
    const impl = `${python} "${path("../../../examples/python-dispositions/impl.py")}"`;
    const { code, stdout } = await hos(["conformance", "run", "--all", "--level", "normative", "--impl", impl]);
    expect(stdout).toContain("3 scenarios: 3 passed, 0 failed · level normative");
    expect(code).toBe(0);
    const reference = await hos(["conformance", "run", "arrival-readiness", "--impl", impl]);
    expect(reference.stdout).toContain("an implementation of the normative level runs with --level normative");
  }, 60_000);

  it.each([
    ["no --impl", ["run", "arrival-readiness"], "name the implementation to test with --impl"],
    ["an unknown scenario", ["run", "early-checkout", "--impl", "x"], "no scenario early-checkout. The scenarios are arrival-readiness, late-checkout, room-out-of-order."],
    ["an unknown level", ["run", "--all", "--level", "strict", "--impl", "x"], "--level is strict; use normative or reference."],
    ["no scenario", ["run", "--impl", "x"], "name the scenarios to run, or use --all."],
    ["an unknown subcommand", ["check"], "unknown subcommand check"],
    ["a scenario directory without scenarios", ["list", "--scenario-dir", "examples"], "examples holds no scenario"],
  ])("exits with 2 on %s", async (_case, args, message) => {
    const { code, stderr } = await hos(["conformance", ...args]);
    expect(code).toBe(2);
    expect(stderr).toContain(message);
  });
});

describe("hos reference-impl", () => {
  it("refuses a protocol it does not speak", async () => {
    const { code, stderr } = await hos(["reference-impl"], { stdin: '{"kind":"scenario","protocol":"hos-conformance/9"}\n' });
    expect(code).toBe(2);
    expect(stderr).toContain("the input speaks hos-conformance/9; this implementation speaks hos-conformance/1");
  });
});

describe("hos replay", () => {
  const manifests = ["pms", "housekeeping", "messaging"].flatMap((producer) => ["--manifest", `conformance/arrival-readiness/producers/${producer}.json`]);

  it("shows the timeline of a recorded stream", async () => {
    const { code, stdout, stderr } = await hos(["replay", "conformance/arrival-readiness/events.jsonl", ...manifests]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(stdout).toMatchSnapshot();
  });

  it("prints the timeline as JSON", async () => {
    const { stdout } = await hos(["replay", "conformance/arrival-readiness/events.jsonl", "--json", ...manifests]);
    const { deliveries, skipped } = JSON.parse(stdout);
    expect(deliveries).toHaveLength(13);
    expect(deliveries[4]).toMatchObject({ line: 5, id: "hk-002231", disposition: "duplicate" });
    expect(deliveries.flatMap((delivery: { situations: unknown[] }) => delivery.situations)).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  it("skips a line that is not a valid event, and says why", async () => {
    const event = scenarios["arrival-readiness"].events[0];
    const { code, stdout } = await hos(["replay", "stream.jsonl", ...manifests], { files: { "stream.jsonl": `${JSON.stringify(event)}\n{"specversion":"1.0"}\n` } });
    expect(code).toBe(1);
    expect(stdout).toContain("2  skipped                id is missing.");
    expect(stdout).toContain("1 delivery: 1 applied · 0 situations · 1 line skipped");
  });

  it("warns that nothing applies without manifests", async () => {
    const { stdout, stderr } = await hos(["replay", "conformance/arrival-readiness/events.jsonl"]);
    expect(stderr).toContain("no --manifest given");
    expect(stdout).toContain("12 undeclared_capability, 1 duplicate");
  });
});

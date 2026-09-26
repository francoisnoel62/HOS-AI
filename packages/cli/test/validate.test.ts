import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { hos, spawnHos, specDirectory } from "./run.ts";

// hos validate against the published corpus. The readable output of every invalid case is kept in a snapshot, so a
// change to a message shows in review.

type Case = { description: string; rule: string; document?: unknown; stream?: unknown[]; manifests?: unknown[] };

const cases = (folder: "invalid" | "valid") =>
  readdirSync(path.join(specDirectory, "conformance", folder))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => [file, JSON.parse(readFileSync(path.join(specDirectory, "conformance", folder, file), "utf8")) as Case] as const);

// A case as the files a user would pass: the document or the stream, and one file per manifest.
function asFiles(file: string, { document, stream, manifests = [] }: Case) {
  const files: Record<string, string> = {};
  const args: string[] = [];
  manifests.forEach((manifest, index) => {
    files[`manifest-${index + 1}.json`] = JSON.stringify(manifest, null, 2);
    args.push("--manifest", `manifest-${index + 1}.json`);
  });
  const name = stream ? file.replace(/\.json$/, ".jsonl") : file;
  files[name] = stream ? stream.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") : JSON.stringify(document, null, 2);
  return { files, args: [...args, name] };
}

type JsonResult = { errors?: Array<{ rule?: string }>; issues?: Array<{ rule?: string; severity: string }> };
const errorRules = (result: JsonResult) => (result.errors ?? result.issues!.filter((issue) => issue.severity === "error")).map((error) => error.rule);

describe("hos validate", () => {
  it.each(cases("invalid"))("rejects conformance/invalid/%s on its rule", async (file, item) => {
    const { files, args } = asFiles(file, item);
    const json = await hos(["validate", "--json", ...args], { files });
    expect(json.code).toBe(1);
    expect(errorRules(JSON.parse(json.stdout).results[0])).toContain(item.rule);
    const text = await hos(["validate", ...args], { files });
    expect(text.code).toBe(1);
    expect(text.stdout).toMatchSnapshot();
  });

  it.each(cases("valid"))("accepts conformance/valid/%s", async (file, item) => {
    const { files, args } = asFiles(file, item);
    const { code, stdout } = await hos(["validate", ...args], { files });
    expect(code).toBe(0);
    expect(stdout).toMatch(/^✓ /);
  });

  it("accepts every published example and the events of the three scenarios", async () => {
    const examples = readdirSync(path.join(specDirectory, "examples"))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => `examples/${file}`);
    const streams = ["arrival-readiness", "room-out-of-order", "late-checkout"].map((id) => `conformance/${id}/events.jsonl`);
    const { code, stdout } = await hos(["validate", ...examples, ...streams]);
    expect(code).toBe(0);
    expect(stdout).toContain(`${examples.length + 3} files: ${examples.length + 3} valid, 0 invalid`);
    expect(stdout).toMatchSnapshot();
  });

  it("checks a stream against its producers' manifests", async () => {
    const producers = ["pms", "housekeeping", "messaging"].flatMap((producer) => ["--manifest", `conformance/arrival-readiness/producers/${producer}.json`]);
    const { code, stdout } = await hos(["validate", ...producers, "conformance/arrival-readiness/events.jsonl"]);
    expect(code).toBe(1);
    expect(stdout).toContain("line 7: urn:hos:pms:demo does not declare housekeeping.task.created at prop_demo");
  });

  it("reads standard input as a document, or as a stream when it is not one JSON document", async () => {
    const event = readFileSync(path.join(specDirectory, "examples/stay.expected.json"), "utf8");
    expect(await hos(["validate", "-"], { stdin: event })).toMatchObject({ code: 0, stdout: "✓ <stdin>: valid event stay.expected\n" });
    const line = JSON.stringify(JSON.parse(event));
    const stream = await hos(["validate", "-"], { stdin: `${line}\n${line}\n` });
    expect(stream).toMatchObject({ code: 0, stdout: expect.stringContaining("✓ <stdin>: valid stream of 2 events (1 note)") });
  });

  it("prints JSON for a CI", async () => {
    const { code, stdout } = await hos(["validate", "--json", "examples/stay.expected.json"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ valid: true, results: [{ file: "examples/stay.expected.json", name: "stay.expected", valid: true, kind: "event", errors: [] }] });
  });

  it("says what is wrong with a file that is not JSON", async () => {
    const { code, stdout } = await hos(["validate", "notes.json"], { files: { "notes.json": "not json" } });
    expect(code).toBe(1);
    expect(stdout).toMatch(/^✗ notes.json: invalid document \(1 error\)\n {2}error {3}Not JSON: /);
  });

  it.each([
    ["no file", ["validate"], "name at least one file"],
    ["an unknown option", ["validate", "--strict", "a.json"], "Unknown option '--strict'"],
    ["a file it cannot read", ["validate", "missing.json"], "cannot read missing.json"],
    ["a manifest that is not JSON", ["validate", "--manifest", "notes.json", "a.jsonl"], "the manifest notes.json is not JSON"],
    ["an unknown command", ["conform"], "unknown command conform"],
    ["no command", [], "name a command"],
  ])("exits with 2 on %s", async (_case, args, message) => {
    const { code, stderr } = await hos(args, { files: { "notes.json": "not json", "a.jsonl": "" } });
    expect(code).toBe(2);
    expect(stderr).toContain(message);
  });

  it("shows its help and version", async () => {
    expect(await hos(["validate", "--help"])).toMatchObject({ code: 0, stdout: expect.stringContaining("Usage: hos validate") });
    expect(await hos(["--help"])).toMatchObject({ code: 0, stdout: expect.stringContaining("validate <file...>") });
    expect((await hos(["--version"])).stdout).toMatch(/^@hos-ai\/cli \S+ \(HOS 0\.1\.0-draft\.\d+\)\n$/);
  });

  it("runs as a command, with its exit codes", async () => {
    expect(await spawnHos(["validate", "examples/stay.expected.json"])).toMatchObject({ code: 0, stdout: "✓ examples/stay.expected.json: valid event stay.expected\n" });
    expect(await spawnHos(["validate", "-"], '{"specversion":"1.0"}')).toMatchObject({ code: 1, stdout: expect.stringContaining("✗ <stdin>: invalid event") });
    expect(await spawnHos(["validate", "missing.json"])).toMatchObject({ code: 2 });
  }, 30_000);
});

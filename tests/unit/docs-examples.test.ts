// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contentDirectory } from "@/lib/docs/content";
import { type CodeBlock, codeBlocks } from "@/lib/docs/markdown";
import { versionLine } from "@/lib/docs/versions";
import { hos, specDirectory } from "@/packages/cli/test/run";

// Every output the tools documentation shows, compared with what hos prints (docs/plans/PLAN-SDK-DOC.md, §8). A block
// ```output id="…" is checked here, by its page and id; one printed by another program says so with from="…". A
// change to a message of hos fails this test until the page shows the new message.

const mdxFiles = (directory = contentDirectory): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? mdxFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
  );

const blocks: Array<CodeBlock & { page: string }> = mdxFiles().flatMap((file) =>
  codeBlocks(readFileSync(file, "utf8")).map((block) => ({
    ...block,
    page: path
      .relative(contentDirectory, file)
      .replaceAll("\\", "/")
      .replace(/\.mdx$/, ""),
  })),
);

function block(page: string, id: string) {
  const found = blocks.filter((item) => item.page === page && item.meta.id === id);
  expect(found, `${page}.mdx has one block with id="${id}"`).toHaveLength(1);
  return found[0].text;
}

const published = (file: string) => readFileSync(path.join(specDirectory, file), "utf8");
const scenarioFiles = (names: string[]) =>
  Object.fromEntries(names.map((name) => [path.basename(name), published(`conformance/arrival-readiness/${name}`)]));

// The CLI's own snapshots, which its tests keep equal to what it prints.
const snapshotFile = fileURLToPath(new URL("../../packages/cli/test/__snapshots__/conformance.test.ts.snap", import.meta.url));
function snapshot(name: string) {
  const text = readFileSync(snapshotFile, "utf8").replace(/\r\n/g, "\n");
  const found = [...text.matchAll(/exports\[`(.+?)`\] = `\n"([\s\S]*?)"\n`;/g)].find(([, key]) => key === `${name} 1`);
  if (!found) throw new Error(`No snapshot "${name}" in ${snapshotFile}`);
  return found[2].replace(/\\`/g, "`").replace(/\\\\/g, "\\").trimEnd();
}

const referenceImpl = [
  `"${process.execPath}"`,
  "--conditions=@hos-ai/source",
  `"${fileURLToPath(new URL("../../packages/cli/src/bin.ts", import.meta.url))}"`,
  "reference-impl",
].join(" ");

type Check = () => Promise<void> | void;
const printed = async (args: string[], files: Record<string, string>, code: number, expected: string) => {
  const result = await hos(args, { files });
  expect(result.code).toBe(code);
  expect(result.stdout.trimEnd()).toBe(expected);
};

const checks: Record<string, Check> = {
  "quickstart#validate-ok": () =>
    printed(
      ["validate", "stay.expected.json"],
      { "stay.expected.json": published("examples/stay.expected.json") },
      0,
      block("quickstart", "validate-ok"),
    ),
  "quickstart#validate-error": () => {
    // The reader's edit: dirty becomes cleaning.
    const broken = published("examples/unit.status_changed.json").replace('"current": "dirty"', '"current": "cleaning"');
    expect(broken).toContain('"current": "cleaning"');
    return printed(["validate", "unit.status_changed.json"], { "unit.status_changed.json": broken }, 1, block("quickstart", "validate-error"));
  },
  "quickstart#conformance-list": () => printed(["conformance", "list"], {}, 0, block("quickstart", "conformance-list")),
  "quickstart#replay": () =>
    printed(
      ["replay", "events.jsonl", "-m", "pms.json", "-m", "housekeeping.json", "-m", "messaging.json"],
      scenarioFiles(["events.jsonl", "producers/pms.json", "producers/housekeeping.json", "producers/messaging.json"]),
      0,
      block("quickstart", "replay"),
    ),
  "concepts#unit-status-changed": () => {
    expect(JSON.parse(block("concepts", "unit-status-changed"))).toEqual(JSON.parse(published("examples/unit.status_changed.json")));
  },
  "concepts#housekeeping-manifest": () => {
    // An excerpt: every member it shows is in the published manifest, with the same value.
    const manifest = JSON.parse(published("conformance/arrival-readiness/producers/housekeeping.json"));
    const excerpt = JSON.parse(block("concepts", "housekeeping-manifest"));
    const { events, ...rest } = excerpt;
    expect(manifest).toMatchObject(rest);
    for (const declared of events) expect(manifest.events).toContainEqual(expect.objectContaining(declared));
  },
  "read-a-report#conformance-pass": () =>
    expect(block("read-a-report", "conformance-pass")).toBe(snapshot("hos conformance > passes the reference implementation on every scenario")),
  "read-a-report#conformance-fail": () =>
    expect(block("read-a-report", "conformance-fail")).toBe(
      snapshot("hos conformance > names the delivery, the path, the expected value and the one received"),
    ),
  "read-a-report#producer-pass": () =>
    expect(block("read-a-report", "producer-pass")).toBe(snapshot("hos conformance producer > passes a producer and its redelivery")),
  "read-a-report#producer-fail": () =>
    expect(block("read-a-report", "producer-fail")).toBe(snapshot("hos conformance producer > names what fails, and prints JSON")),
  "authoring#producer-fail": () =>
    expect(block("authoring", "producer-fail")).toBe(snapshot("hos conformance producer > names what fails, and prints JSON")),
  "read-a-report#conformance-normative": () =>
    printed(["conformance", "run", "--all", "--level", "normative", "--impl", referenceImpl], {}, 0, block("read-a-report", "conformance-normative")),
};

describe("outputs shown in the tools documentation", () => {
  it("checks every output block, or names the program that prints it", () => {
    const outputs = blocks.filter((item) => item.language === "output");
    for (const item of outputs) expect(item.meta.id || item.meta.from, `an output block of ${item.page}.mdx has no id`).toBeTruthy();
    const withId = blocks.filter((item) => item.meta.id).map((item) => `${item.page}#${item.meta.id}`);
    expect(new Set(withId).size, "ids are unique on each page").toBe(withId.length);
    expect(withId.sort()).toEqual(Object.keys(checks).sort());
  });

  it("shows what hos --version prints", async () => {
    expect((await hos(["--version"])).stdout.trim()).toBe(versionLine);
  });

  it.each(Object.entries(checks))("%s is what hos prints", async (_, check) => check(), 60_000);
});

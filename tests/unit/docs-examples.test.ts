// @vitest-environment node
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contentDirectory } from "@/lib/docs/content";
import { type CodeBlock, codeBlocks } from "@/lib/docs/markdown";
import { versionLine } from "@/lib/docs/versions";
import { hos, specDirectory } from "@/packages/cli/test/run";

// Every output the tools documentation shows, compared with what hos prints (docs/plans/PLAN-SDK-DOC.md, §8). A block
// ```output id="…" is checked here, by its page and id; one printed by another program says so with from="…". A block
// with excerpt="head" or excerpt="tail" shows the first or the last lines of the output. A change to a message of hos
// fails this test until the page shows the new message.

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

function shown(page: string, id: string) {
  const found = blocks.filter((item) => item.page === page && item.meta.id === id);
  expect(found, `${page}.mdx has one block with id="${id}"`).toHaveLength(1);
  return found[0];
}
const block = (page: string, id: string) => shown(page, id).text;

// A block with varies="kid" or varies="kid time" shows one run's key ids and times: each reader gets others.
const keyId = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
const instant = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g;
function steady(text: string, varies = "") {
  let result = text;
  if (varies.includes("kid")) result = result.replace(keyId, "<kid>");
  if (varies.includes("time")) result = result.replace(instant, "<time>");
  return result;
}

function expectShown(actual: string, { text: shownText, meta }: { text: string; meta: Record<string, string> }) {
  const text = steady(shownText, meta.varies);
  const lines = steady(actual.replace(/\r\n/g, "\n").trimEnd(), meta.varies).split("\n");
  const expected = text.split("\n");
  if (meta.excerpt === "head") expect(lines.slice(0, expected.length)).toEqual(expected);
  else if (meta.excerpt === "tail") expect(lines.slice(-expected.length)).toEqual(expected);
  else expect(lines.join("\n")).toBe(text);
}

// Runs hos as the page shows it, and compares its standard output with the block.
async function printed(page: string, id: string, args: string[], { files = {}, cwd, stdin, code = 0 }: RunOptions = {}) {
  const result = await hos(args, { files, stdin, ...(cwd ? { cwd } : {}) });
  expect(result.code, result.stderr).toBe(code);
  expectShown(result.stdout, shown(page, id));
  return result;
}
type RunOptions = { files?: Record<string, string>; cwd?: string; stdin?: string; code?: number };

const published = (file: string) => readFileSync(path.join(specDirectory, file), "utf8");
const scenario = "conformance/arrival-readiness";
const arrivalFiles = (...names: string[]) => Object.fromEntries(names.map((name) => [path.basename(name), published(`${scenario}/${name}`)]));
const withManifests = ["-m", "pms.json", "-m", "housekeeping.json", "-m", "messaging.json"];
const streamAndManifests = () => arrivalFiles("events.jsonl", "producers/pms.json", "producers/housekeeping.json", "producers/messaging.json");
const brokenStatus = () => published("examples/unit.status_changed.json").replace('"current": "dirty"', '"current": "cleaning"');

// The CLI's own snapshots, which its tests keep equal to what it prints.
function snapshot(suite: "conformance" | "validate", name: string) {
  const file = fileURLToPath(new URL(`../../packages/cli/test/__snapshots__/${suite}.test.ts.snap`, import.meta.url));
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const found = [...text.matchAll(/exports\[`(.+?)`\] = `\n"([\s\S]*?)"\n`;/g)].find(([, key]) => key === `${name} 1`);
  if (!found) throw new Error(`No snapshot "${name}" in ${file}`);
  return found[2].replace(/\\`/g, "`").replace(/\\\\/g, "\\").trimEnd();
}

const bin = fileURLToPath(new URL("../../packages/cli/src/bin.ts", import.meta.url));
const referenceImpl = [`"${process.execPath}"`, "--conditions=@hos-ai/source", `"${bin}"`, "reference-impl"].join(" ");

// A folder of the reader's, with the files a page has them create.
function folder(files: Record<string, string> = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "hos-docs-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(directory, name), text);
  return directory;
}

// fs.cpSync is not used: in Node 24 on Windows, it ends the process on a path with a non-ASCII character.
function copyFolder(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyFolder(path.join(from, entry.name), path.join(to, entry.name));
    else copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
  }
}

// Python 3.11 or later, for the Python example; the checks that need it are skipped without it.
const python = ["python3", "python", "py"].find((command) => {
  try {
    return /Python 3\.(1[1-9]|[2-9]\d)/.test(execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return false;
  }
});
const pythonExample = () => readFileSync(fileURLToPath(new URL("../../examples/python-dispositions/impl.py", import.meta.url)), "utf8");

type Check = () => Promise<unknown> | unknown;

const checks: Record<string, Check> = {
  // Quickstart
  "quickstart#validate-ok": () =>
    printed("quickstart", "validate-ok", ["validate", "stay.expected.json"], {
      files: { "stay.expected.json": published("examples/stay.expected.json") },
    }),
  "quickstart#validate-error": () => {
    // The reader's edit: dirty becomes cleaning.
    expect(brokenStatus()).toContain('"current": "cleaning"');
    return printed("quickstart", "validate-error", ["validate", "unit.status_changed.json"], {
      files: { "unit.status_changed.json": brokenStatus() },
      code: 1,
    });
  },
  "quickstart#conformance-list": () => printed("quickstart", "conformance-list", ["conformance", "list"]),
  "quickstart#replay": () => printed("quickstart", "replay", ["replay", "events.jsonl", ...withManifests], { files: streamAndManifests() }),

  // Concepts
  "concepts#unit-status-changed": () => {
    expect(JSON.parse(block("concepts", "unit-status-changed"))).toEqual(JSON.parse(published("examples/unit.status_changed.json")));
  },
  "concepts#housekeeping-manifest": () => {
    // An excerpt: every member it shows is in the published manifest, with the same value.
    const manifest = JSON.parse(published(`${scenario}/producers/housekeeping.json`));
    const { events, ...rest } = JSON.parse(block("concepts", "housekeeping-manifest"));
    expect(manifest).toMatchObject(rest);
    for (const declared of events) expect(manifest.events).toContainEqual(expect.objectContaining(declared));
  },

  // Read a report
  "read-a-report#conformance-pass": () =>
    expect(block("read-a-report", "conformance-pass")).toBe(
      snapshot("conformance", "hos conformance > passes the reference implementation on every scenario"),
    ),
  "read-a-report#conformance-fail": () =>
    expect(block("read-a-report", "conformance-fail")).toBe(
      snapshot("conformance", "hos conformance > names the delivery, the path, the expected value and the one received"),
    ),
  "read-a-report#producer-pass": () =>
    expect(block("read-a-report", "producer-pass")).toBe(snapshot("conformance", "hos conformance producer > passes a producer and its redelivery")),
  "read-a-report#producer-fail": () =>
    expect(block("read-a-report", "producer-fail")).toBe(snapshot("conformance", "hos conformance producer > names what fails, and prints JSON")),
  "read-a-report#conformance-normative": () =>
    printed("read-a-report", "conformance-normative", ["conformance", "run", "--all", "--level", "normative", "--impl", referenceImpl]),
  "authoring#producer-fail": () =>
    expect(block("authoring", "producer-fail")).toBe(snapshot("conformance", "hos conformance producer > names what fails, and prints JSON")),

  // Validate
  "guides/validate#several-files": () =>
    printed("guides/validate", "several-files", ["validate", "stay.expected.json", "unit.status_changed.json", "housekeeping.json"], {
      files: {
        "stay.expected.json": published("examples/stay.expected.json"),
        "unit.status_changed.json": published("examples/unit.status_changed.json"),
        ...arrivalFiles("producers/housekeeping.json"),
      },
    }),
  "guides/validate#stream": () => printed("guides/validate", "stream", ["validate", "events.jsonl"], { files: arrivalFiles("events.jsonl") }),
  "guides/validate#stream-manifests": () =>
    printed("guides/validate", "stream-manifests", ["validate", "events.jsonl", ...withManifests], { files: streamAndManifests(), code: 1 }),
  "guides/validate#stdin": () => printed("guides/validate", "stdin", ["validate", "-"], { stdin: published(`${scenario}/events.jsonl`) }),
  "guides/validate#json": () =>
    printed("guides/validate", "json", ["validate", "--json", "stay.expected.json"], {
      files: { "stay.expected.json": published("examples/stay.expected.json") },
    }),
  "guides/validate#read-a-line": () =>
    printed("guides/validate", "read-a-line", ["validate", "unit.status_changed.json"], {
      files: { "unit.status_changed.json": brokenStatus() },
      code: 1,
    }),
  "guides/validate#conflicting-id": () =>
    expect(block("guides/validate", "conflicting-id")).toBe(
      snapshot("validate", "hos validate > rejects conformance/invalid/stream-conflicting-id.json on its rule"),
    ),

  // Replay
  "guides/replay#replay": () => printed("guides/replay", "replay", ["replay", "events.jsonl", ...withManifests], { files: streamAndManifests() }),
  "guides/replay#ready-clean": () =>
    printed("guides/replay", "ready-clean", ["replay", "events.jsonl", ...withManifests, "--ready", "clean"], { files: streamAndManifests() }),
  "guides/replay#json": () =>
    printed("guides/replay", "json", ["replay", "events.jsonl", ...withManifests, "--json"], { files: streamAndManifests() }),
  "guides/replay#no-manifest": async () => {
    const { stderr } = await printed("guides/replay", "no-manifest", ["replay", "events.jsonl"], { files: arrivalFiles("events.jsonl") });
    expect(stderr).toContain("hos replay: no --manifest given, so every fact is undeclared and nothing is applied.");
  },

  // Test a consumer
  "guides/test-a-consumer#skeleton": () => expect(block("guides/test-a-consumer", "skeleton")).toContain("hos-conformance/1"),
  "guides/test-a-consumer#skeleton-run": () => {
    const cwd = folder({ "consumer.mjs": block("guides/test-a-consumer", "skeleton") });
    return printed(
      "guides/test-a-consumer",
      "skeleton-run",
      ["conformance", "run", "arrival-readiness", "--level", "normative", "--impl", `"${process.execPath}" consumer.mjs`],
      { cwd, code: 1 },
    );
  },
  "guides/test-a-consumer#scenario-dir": () => {
    const cwd = folder();
    copyFolder(path.join(specDirectory, scenario), path.join(cwd, "scenarios", "arrival-readiness"));
    return printed("guides/test-a-consumer", "scenario-dir", ["conformance", "list", "--scenario-dir", "scenarios"], { cwd });
  },

  // Check a producer, with the example kit and the reader's edits
  "guides/check-a-producer#pass": () => printed("guides/check-a-producer", "pass", producerCheck, { files: producerKit() }),
  "guides/check-a-producer#new-id": () =>
    printed("guides/check-a-producer", "new-id", producerCheck, { files: producerKit({ redelivery: ["pms-000312", "pms-000999"] }), code: 1 }),
  "guides/check-a-producer#changed-content": () =>
    printed("guides/check-a-producer", "changed-content", producerCheck, {
      files: producerKit({ redelivery: ["2026-07-12T14:03:00Z", "2026-07-30T12:00:00Z"] }),
      code: 1,
    }),
  "guides/check-a-producer#no-redelivery": () =>
    printed("guides/check-a-producer", "no-redelivery", producerCheck.slice(0, -2), { files: producerKit() }),
  "guides/check-a-producer#json": () => printed("guides/check-a-producer", "json", [...producerCheck, "--json"], { files: producerKit() }),

  // Sign and publish: the example producer, then a key and a signature of the reader's own
  "guides/sign-and-publish#example-verify": () =>
    printed("guides/sign-and-publish", "example-verify", ["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], { files: signingExample() }),
  "guides/sign-and-publish#example-tampered": () => {
    const files = signingExample();
    // The reader's edit: the producer now claims authority on occupancy.
    const tampered = files["manifest.json"].replace('"authoritative": false', '"authoritative": true');
    expect(tampered).not.toBe(files["manifest.json"]);
    return printed("guides/sign-and-publish", "example-tampered", ["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], {
      files: { ...files, "manifest.json": tampered },
      code: 1,
    });
  },
  "guides/sign-and-publish#example-expired": () =>
    printed(
      "guides/sign-and-publish",
      "example-expired",
      ["manifest", "verify", "manifest.json", "--jwks", "jwks.json", "--at", "2027-10-01T00:00:00Z"],
      {
        files: signingExample(),
        code: 1,
      },
    ),
  "guides/sign-and-publish#verify-url": async () => {
    const base = "https://hos-ai.vercel.app/spec/0.1/conformance/signing/well-known";
    const files = signingExample();
    const urls = Object.fromEntries(Object.entries(files).map(([name, text]) => [`${base}/${name}`, text]));
    const result = await hos(["manifest", "verify", `${base}/manifest.json`, "--jws", `${base}/manifest.jws`, "--jwks-url", `${base}/jwks.json`], {
      urls,
    });
    expect(result.code, result.stderr).toBe(0);
    expectShown(result.stdout, shown("guides/sign-and-publish", "verify-url"));
  },
  "guides/sign-and-publish#keygen": () => ownKey(),
  "guides/sign-and-publish#sign": () => ownSignature(),
  "guides/sign-and-publish#verify": async () => {
    const files = await ownSignature();
    return printed("guides/sign-and-publish", "verify", ["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], { files });
  },
  "guides/sign-and-publish#rotate": async () => {
    const { written } = await ownKey();
    return printed("guides/sign-and-publish", "rotate", ["manifest", "keygen", "--key", "private-key-2.json", "--jwks", "jwks.json"], {
      files: { "private-key.json": written["private-key.json"], "jwks.json": written["jwks.json"] },
    });
  },
  "guides/sign-and-publish#exposed": async () => {
    // A key set that publishes the private key by mistake.
    const files = await ownSignature();
    const exposed = JSON.stringify({ keys: [JSON.parse(files["private-key.json"])] });
    return printed("guides/sign-and-publish", "exposed", ["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], {
      files: { ...files, "jwks.json": exposed },
      code: 1,
    });
  },
};

// The example producer of the check-a-producer guide, with the reader's find-and-replace in its redelivery.
const producerCheck = ["conformance", "producer", "--manifest", "manifest.json", "--stream", "recording.jsonl", "--redelivery", "redelivery.jsonl"];
const kitDirectory = fileURLToPath(new URL("../../public/docs/tools/examples/producer/", import.meta.url));
function producerKit({ redelivery }: { redelivery?: [string, string] } = {}) {
  const files = Object.fromEntries(
    ["manifest.json", "recording.jsonl", "redelivery.jsonl"].map((name) => [name, readFileSync(path.join(kitDirectory, name), "utf8")]),
  );
  if (redelivery) {
    const [from, to] = redelivery;
    expect(files["redelivery.jsonl"].split(from)).toHaveLength(2);
    files["redelivery.jsonl"] = files["redelivery.jsonl"].replace(from, to);
  }
  return files;
}

// The fictional producer HOS publishes with its signature and key set.
const signingExample = () =>
  Object.fromEntries(["manifest.json", "manifest.jws", "jwks.json"].map((name) => [name, published(`conformance/signing/well-known/${name}`)]));

// The reader's own key, then signature, on the example PMS manifest.
async function ownKey() {
  return printed("guides/sign-and-publish", "keygen", ["manifest", "keygen", "--key", "private-key.json", "--jwks", "jwks.json"]);
}
async function ownSignature() {
  const { written } = await ownKey();
  const files = {
    "manifest.json": producerKit()["manifest.json"],
    "private-key.json": written["private-key.json"],
    "jwks.json": written["jwks.json"],
  };
  const signed = await printed("guides/sign-and-publish", "sign", ["manifest", "sign", "manifest.json", "--key", "private-key.json"], { files });
  return { ...files, "manifest.jws": signed.written["manifest.jws"] };
}

// The checks that run the Python example.
const pythonChecks: Record<string, Check> = {
  "guides/test-a-consumer#python-normative": () =>
    printed("guides/test-a-consumer", "python-normative", ["conformance", "run", "--all", "--level", "normative", "--impl", `${python} impl.py`], {
      cwd: folder({ "impl.py": pythonExample() }),
    }),
  "guides/test-a-consumer#dedup-lines": () => expect(pythonExample()).toContain(`${block("guides/test-a-consumer", "dedup-lines")}\n`),
  "guides/test-a-consumer#python-no-dedup": () => {
    // The reader's edit: the two lines of deduplication are deleted.
    const edited = pythonExample().replace(`${block("guides/test-a-consumer", "dedup-lines")}\n`, "");
    expect(edited).not.toBe(pythonExample());
    return printed(
      "guides/test-a-consumer",
      "python-no-dedup",
      ["conformance", "run", "--all", "--level", "normative", "--impl", `${python} impl.py`],
      {
        cwd: folder({ "impl.py": edited }),
        code: 1,
      },
    );
  },
  "guides/test-a-consumer#python-reference": () =>
    printed("guides/test-a-consumer", "python-reference", ["conformance", "run", "arrival-readiness", "--impl", `${python} impl.py`], {
      cwd: folder({ "impl.py": pythonExample() }),
      code: 1,
    }),
};

describe("outputs shown in the tools documentation", () => {
  it("checks every output block, or names the program that prints it", () => {
    const outputs = blocks.filter((item) => item.language === "output");
    for (const item of outputs) expect(item.meta.id || item.meta.from, `an output block of ${item.page}.mdx has no id`).toBeTruthy();
    const withId = blocks.filter((item) => item.meta.id).map((item) => `${item.page}#${item.meta.id}`);
    expect(new Set(withId).size, "ids are unique on each page").toBe(withId.length);
    expect(withId.sort()).toEqual([...Object.keys(checks), ...Object.keys(pythonChecks)].sort());
  });

  it("publishes an example producer made of the PMS facts of the early-arrival scenario", () => {
    const kit = producerKit();
    const pms = JSON.parse(published(`${scenario}/producers/pms.json`));
    const facts = published(`${scenario}/events.jsonl`)
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      // The one fact the PMS does not declare: the example producer passes its checks.
      .filter((fact) => fact.source === pms.producer && fact.type !== "housekeeping.task.created");
    const lines = (text: string) =>
      text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    expect(JSON.parse(kit["manifest.json"])).toEqual(pms);
    expect(lines(kit["recording.jsonl"])).toEqual(facts);
    expect(lines(kit["redelivery.jsonl"])).toEqual(facts);
  });

  it("shows what hos --version prints", async () => {
    expect((await hos(["--version"])).stdout.trim()).toBe(versionLine);
  });

  it.each(Object.entries(checks))(
    "%s is what hos prints",
    async (_, check) => {
      await check();
    },
    60_000,
  );
  it.skipIf(!python).each(Object.entries(pythonChecks))(
    "%s is what hos prints with the Python example",
    async (_, check) => {
      await check();
    },
    60_000,
  );
});

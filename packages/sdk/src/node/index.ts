import { readFileSync } from "node:fs";
import path from "node:path";

import { type ConformanceScenario, type ExpectedOutcome, parseJsonLines } from "../conformance.ts";
import type { HosFact, ProducerManifest } from "../types.generated.ts";

// @hos-ai/sdk/node: loaders for a conformance scenario published as files. A scenario directory holds scenario.json, the
// producer manifests and the events it names, and expected.json.

function readText(directory: string, file: string) {
  return readFileSync(path.join(directory, file), "utf8");
}

export function loadScenario(directory: string) {
  const scenario = JSON.parse(readText(directory, "scenario.json")) as ConformanceScenario;
  const manifests = scenario.files.producers.map((file) => JSON.parse(readText(directory, file)) as ProducerManifest);
  const events = parseJsonLines(readText(directory, scenario.files.events)) as HosFact[];
  return { scenario, manifests, events };
}

export function loadExpectedOutcome(directory: string) {
  return JSON.parse(readText(directory, "expected.json")) as ExpectedOutcome;
}

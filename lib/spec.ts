import { readFileSync } from "node:fs";
import path from "node:path";

import { loadExpectedOutcome as loadExpectedOutcomeFrom, loadScenario as loadScenarioFrom } from "@hos-ai/sdk/node";

// Where the site publishes the HOS 0.1 artefacts, under public/, and server-side loaders for its conformance scenarios.

export const specVersionPath = "/spec/0.1";
export const examplesPath = `${specVersionPath}/examples`;

// Every scenario replays through the arrival-readiness reference projection. The first, the early arrival, is the one the
// PMS mappings reproduce.
export const conformanceScenarios = ["arrival-readiness", "room-out-of-order", "late-checkout"] as const;
export type ConformanceScenarioId = (typeof conformanceScenarios)[number];
export const scenarioPath = (id: ConformanceScenarioId = "arrival-readiness") => `${specVersionPath}/conformance/${id}`;

const scenarioDirectory = (id: ConformanceScenarioId) => path.join(process.cwd(), "public", scenarioPath(id));

export const loadScenario = (id: ConformanceScenarioId) => loadScenarioFrom(scenarioDirectory(id));
export const loadArrivalScenario = () => loadScenario("arrival-readiness");
export const loadExpectedOutcome = (id: ConformanceScenarioId = "arrival-readiness") => loadExpectedOutcomeFrom(scenarioDirectory(id));

// The signing test vectors, and what a fictional producer serves under /.well-known/hos/: its manifest, the manifest's
// signature and its keys.
export const signingPath = `${specVersionPath}/conformance/signing`;
export const wellKnownExamplePath = `${signingPath}/well-known`;

// The protected header of the example's signature, decoded.
export function loadSigningExampleHeader() {
  const jws = readFileSync(path.join(process.cwd(), "public", wellKnownExamplePath, "manifest.jws"), "utf8");
  return JSON.parse(Buffer.from(jws.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;
}

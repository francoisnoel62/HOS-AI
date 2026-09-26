import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { JSONWebKeySet } from "jose";

import type { ManifestSignatureError, ProducerManifest, Validator } from "../src/index.ts";
import { loadExpectedOutcome as loadExpectedOutcomeFrom, loadScenario as loadScenarioFrom } from "../src/node/index.ts";

// The published HOS 0.1 artefacts the tests check the SDK against. They live in the site's public directory until the
// specification has a repository of its own.

export const specDirectory = fileURLToPath(new URL("../../../public/spec/0.1/", import.meta.url));

export const readJson = (file: string) => JSON.parse(readFileSync(path.join(specDirectory, file), "utf8"));

export const listExamples = () =>
  readdirSync(path.join(specDirectory, "examples"))
    .filter((file) => file.endsWith(".json"))
    .sort();

// Every published example, entities included, relative to examples/.
export const listExampleFiles = () =>
  readdirSync(path.join(specDirectory, "examples"), { recursive: true })
    .map((file) => String(file).replaceAll("\\", "/"))
    .filter((file) => file.endsWith(".json"))
    .sort();

// The scenario directories of the corpus, each with its scenario.json.
export const conformanceScenarios = readdirSync(path.join(specDirectory, "conformance"))
  .filter((entry) => existsSync(path.join(specDirectory, "conformance", entry, "scenario.json")))
  .sort();

// A case of conformance/invalid or conformance/valid: a document, or the lines of a stream with the producers' manifests.
export type ConformanceCase = { file: string; description: string; rule: string; document?: unknown; stream?: unknown[]; manifests?: ProducerManifest[] };

export const loadCases = (folder: "invalid" | "valid"): ConformanceCase[] =>
  readdirSync(path.join(specDirectory, "conformance", folder))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({ file, ...readJson(`conformance/${folder}/${file}`) }));

// A signing test vector: a manifest, its detached JWS and the producer's key set, with the verdict expected at a time.
export type SigningVector = {
  file: string;
  description: string;
  rule: string;
  at: string;
  manifest: unknown;
  jws: string;
  jwks: JSONWebKeySet;
  expected: { valid: boolean; error?: ManifestSignatureError };
};

export const loadSigningVectors = (): SigningVector[] =>
  readdirSync(path.join(specDirectory, "conformance", "signing"))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({ file, ...readJson(`conformance/signing/${file}`) }));

// What the fictional producer of the signing example serves under /.well-known/hos/.
export const loadWellKnownExample = () => ({
  manifest: readJson("conformance/signing/well-known/manifest.json") as ProducerManifest,
  jws: readFileSync(path.join(specDirectory, "conformance/signing/well-known/manifest.jws"), "utf8"),
  jwks: readJson("conformance/signing/well-known/jwks.json") as JSONWebKeySet,
});

// A stream case lists its lines: an object is written as JSON, a string as it is.
export const streamText = (lines: unknown[]) => lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n");

const scenarioDirectory = (id: string) => path.join(specDirectory, "conformance", id);
export const loadScenario = (id: string) => loadScenarioFrom(scenarioDirectory(id));
export const loadArrivalScenario = () => loadScenario("arrival-readiness");
export const loadExpectedOutcome = (id = "arrival-readiness") => loadExpectedOutcomeFrom(scenarioDirectory(id));

export const errors = (validate: Validator) => JSON.stringify(validate.errors);

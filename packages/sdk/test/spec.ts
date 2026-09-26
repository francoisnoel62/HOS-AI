import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Validator } from "../src/index.ts";
import { loadExpectedOutcome as loadExpectedOutcomeFrom, loadScenario as loadScenarioFrom } from "../src/node/index.ts";

// The published HOS 0.1 artefacts the tests check the SDK against. They live in the site's public directory until the
// specification has a repository of its own.

export const specDirectory = fileURLToPath(new URL("../../../public/spec/0.1/", import.meta.url));

export const readJson = (file: string) => JSON.parse(readFileSync(path.join(specDirectory, file), "utf8"));

export const listExamples = () =>
  readdirSync(path.join(specDirectory, "examples"))
    .filter((file) => file.endsWith(".json"))
    .sort();

export const conformanceScenarios = readdirSync(path.join(specDirectory, "conformance")).sort();

const scenarioDirectory = (id: string) => path.join(specDirectory, "conformance", id);
export const loadScenario = (id: string) => loadScenarioFrom(scenarioDirectory(id));
export const loadArrivalScenario = () => loadScenario("arrival-readiness");
export const loadExpectedOutcome = (id = "arrival-readiness") => loadExpectedOutcomeFrom(scenarioDirectory(id));

export const errors = (validate: Validator) => JSON.stringify(validate.errors);

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Situation, HosFact, ProducerManifest, ProjectionConfig } from "@/lib/hos/types";
import type { Disposition, Readiness, ReplayStep, SituationStatus } from "@/lib/hos/projection";

// Server-side loaders for the published HOS 0.1 artefacts: the conformance scenarios and the examples.

export const specVersionPath = "/spec/0.1";
export const examplesPath = `${specVersionPath}/examples`;

// Every scenario replays through the arrival-readiness reference projection. The first, the early arrival, is the one the
// PMS mappings reproduce.
export const conformanceScenarios = ["arrival-readiness", "room-out-of-order", "late-checkout"] as const;
export type ConformanceScenarioId = (typeof conformanceScenarios)[number];
export const scenarioPath = (id: ConformanceScenarioId = "arrival-readiness") => `${specVersionPath}/conformance/${id}`;

export type ArrivalScenario = {
  scenario: string;
  hosschemaversion: "0.1";
  status: string;
  title: string;
  summary: string;
  covers: string[];
  tenant: { id: string };
  property: { id: string; timezone: string; country: string };
  projection: ProjectionConfig;
  files: { events: string; expected: string; producers: string[] };
  deliveries: Array<{ delivery: number; checks: string; note: string }>;
};

export type ExpectedOutcome = {
  scenario: string;
  hosschemaversion: "0.1";
  compare: string;
  deliveries: Array<{
    delivery: number;
    source: string;
    id: string;
    disposition: Disposition;
    stays: Record<string, { readiness: Readiness; situation: SituationStatus }>;
  }>;
  situations: Array<{ delivery: number; event: Omit<Situation, "id" | "hosrecordedat"> }>;
};

const publicDirectory = path.join(process.cwd(), "public");

function readScenarioFile(id: ConformanceScenarioId, file: string) {
  return readFileSync(path.join(publicDirectory, scenarioPath(id), file), "utf8");
}

export function parseJsonLines(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function loadScenario(id: ConformanceScenarioId) {
  const scenario = JSON.parse(readScenarioFile(id, "scenario.json")) as ArrivalScenario;
  const manifests = scenario.files.producers.map((file) => JSON.parse(readScenarioFile(id, file)) as ProducerManifest);
  const events = parseJsonLines(readScenarioFile(id, scenario.files.events)) as HosFact[];
  return { scenario, manifests, events };
}

export const loadArrivalScenario = () => loadScenario("arrival-readiness");

export function listExamples() {
  return readdirSync(path.join(publicDirectory, examplesPath))
    .filter((file) => file.endsWith(".json"))
    .sort();
}

export function loadExpectedOutcome(id: ConformanceScenarioId = "arrival-readiness") {
  return JSON.parse(readScenarioFile(id, "expected.json")) as ExpectedOutcome;
}

// The comparable part of a replay: what expected.json pins down.
export function toExpectedOutcome(steps: ReplayStep[], scenario: ArrivalScenario): ExpectedOutcome {
  return {
    scenario: scenario.scenario,
    hosschemaversion: "0.1",
    compare:
      "Replay events.jsonl in file order. For every delivery compare the disposition and, for every known stay, its readiness and situation. For situations compare every attribute except id and hosrecordedat, which are implementation-defined.",
    deliveries: steps.map((step) => ({
      delivery: step.delivery,
      source: step.event.source,
      id: step.event.id,
      disposition: step.disposition,
      stays: Object.fromEntries(Object.entries(step.stays).map(([stayId, view]) => [stayId, { readiness: view.readiness, situation: view.situation }])),
    })),
    situations: steps.flatMap((step) =>
      step.emitted.map((situation) => {
        const { id: _id, hosrecordedat: _recordedAt, ...event } = situation;
        return { delivery: step.delivery, event };
      }),
    ),
  };
}

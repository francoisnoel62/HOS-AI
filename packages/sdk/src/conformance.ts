import type { Disposition } from "./processing.ts";
import type { ProjectionConfig, Readiness, ReplayStep, SituationStatus } from "./reference/arrival-readiness.ts";
import type { Situation } from "./reference/types.generated.ts";

// The published HOS 0.1 conformance corpus: a scenario, the outcome it expects, and the comparable part of a replay.
// Loading the files from disk is under @hos-ai/sdk/node.

// Every scenario replays through the arrival-readiness reference projection.
export type ConformanceScenario = {
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

export function parseJsonLines(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// The comparable part of a replay: what expected.json pins down.
export function toExpectedOutcome(steps: ReplayStep[], scenario: ConformanceScenario): ExpectedOutcome {
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

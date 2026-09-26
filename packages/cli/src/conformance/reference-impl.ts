import type { HosFact, ProducerManifest } from "@hos-ai/sdk";
import { type ProjectionConfig, replayArrivalReadiness } from "@hos-ai/sdk/reference";

import { exit, type Io } from "../io.ts";
import { protocol } from "./protocol.ts";

// hos reference-impl, left out of the help: the protocol implemented with the SDK's reference projection. The tool
// checks itself with hos conformance run --all --impl "hos reference-impl".

type Line = { kind?: string; protocol?: string; projection?: ProjectionConfig; manifest?: ProducerManifest; delivery?: number; event?: HosFact };

export async function referenceImplCommand(_args: string[], io: Io): Promise<number> {
  const lines = (await io.readStdin())
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Line);
  const scenario = lines.find((line) => line.kind === "scenario");
  if (scenario?.protocol !== protocol) {
    io.stderr(`hos reference-impl: the input speaks ${scenario?.protocol ?? "no known protocol"}; this implementation speaks ${protocol}.\n`);
    return exit.usage;
  }
  const manifests = lines.filter((line) => line.kind === "manifest").map((line) => line.manifest!);
  const deliveries = lines.filter((line) => line.kind === "delivery");
  const steps = replayArrivalReadiness(
    deliveries.map((line) => line.event!),
    manifests,
    scenario.projection!,
  );
  for (const [index, step] of steps.entries()) {
    const stays = Object.fromEntries(Object.entries(step.stays).map(([id, view]) => [id, { readiness: view.readiness, situation: view.situation }]));
    io.stdout(`${JSON.stringify({ delivery: deliveries[index].delivery, disposition: step.disposition, stays, situations: step.emitted })}\n`);
  }
  return exit.ok;
}

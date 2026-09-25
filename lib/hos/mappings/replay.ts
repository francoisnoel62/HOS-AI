import { readFileSync } from "node:fs";
import path from "node:path";

import { loadArrivalScenario, specVersionPath } from "@/lib/hos/conformance";
import { apaleoRecordingAdapter } from "@/lib/hos/mappings/apaleo";
import { cloudbedsRecordingAdapter } from "@/lib/hos/mappings/cloudbeds";
import type { MappingRecording, RecordedDelivery, RecordingAdapter, Unmapped } from "@/lib/hos/mappings/common";
import { mewsRecordingAdapter } from "@/lib/hos/mappings/mews";
import type { HosFact } from "@/lib/hos/types";

// Server-side loader for the PMS recordings of the arrival-readiness scenario: the PMS deliveries of the conformance
// corpus, replaced by the payloads a real PMS API would send and mapped through that PMS's reference adapter.

export const pmsMappings = ["mews", "apaleo", "cloudbeds"] as const;
export type PmsMapping = (typeof pmsMappings)[number];

const adapters: Record<PmsMapping, (recording: MappingRecording) => RecordingAdapter> = {
  mews: mewsRecordingAdapter,
  apaleo: apaleoRecordingAdapter,
  cloudbeds: cloudbedsRecordingAdapter,
};

export const mappingPath = (pms: PmsMapping) => `${specVersionPath}/mappings/${pms}`;

// One HOS fact of the mixed stream: the corpus delivery it stands for (null when the corpus has no counterpart) and,
// for mapped facts, the PMS delivery it came from.
export type ArrivalFact = { corpusDelivery: number | null; event: HosFact; recorded?: RecordedDelivery; unmapped: Unmapped[] };

export function loadRecording(pms: PmsMapping) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public", mappingPath(pms), "arrival-readiness.json"), "utf8")) as MappingRecording;
}

export function buildArrivalStream(pms: PmsMapping) {
  const { scenario, manifests, events } = loadArrivalScenario();
  const recording = loadRecording(pms);
  const adapt = adapters[pms](recording);
  const stream: ArrivalFact[] = [];

  events.forEach((event, index) => {
    const delivery = index + 1;
    if (event.source !== recording.adapter.source) {
      stream.push({ corpusDelivery: delivery, event, unmapped: [] });
      return;
    }
    // A PMS delivery takes the place of the first corpus delivery it reproduces; other PMS deliveries are covered by it or not reproduced.
    const recorded = recording.deliveries.find((item) => item.reproduces.find((corpus) => corpus !== null) === delivery);
    if (!recorded) return;
    const { events: mapped, unmapped } = adapt(recorded);
    mapped.forEach((fact, position) => stream.push({ corpusDelivery: recorded.reproduces[position] ?? null, event: fact, recorded, unmapped }));
  });

  return { scenario, manifests, corpus: events, recording, stream };
}

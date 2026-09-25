import { readFileSync } from "node:fs";
import path from "node:path";

import { loadArrivalScenario, specVersionPath } from "@/lib/hos/conformance";
import {
  type Crosswalk,
  createIdentityRegistry,
  createMewsAdapter,
  type MewsPropertyConfig,
  type MewsReservation,
  type MewsResource,
  type MewsUnmapped,
  type MewsWebhook,
} from "@/lib/hos/mappings/mews";
import type { HosFact } from "@/lib/hos/types";

// Server-side loader for the Mews recording of the arrival-readiness scenario: the PMS deliveries of the conformance
// corpus, replaced by the Mews payloads they would come from and mapped through the reference adapter.

export const mewsMappingPath = `${specVersionPath}/mappings/mews`;

export type MewsRecordedDelivery = {
  delivery: string;
  reproduces: number[];
  received_at: string;
  note: string;
  webhook: MewsWebhook;
  fetched: Array<{ operation: string; request: Record<string, unknown>; response: { Reservations?: MewsReservation[]; Resources?: MewsResource[]; Cursor?: string | null } }>;
};

export type MewsRecording = {
  mapping: string;
  hosschemaversion: "0.1";
  status: "experimental";
  title: string;
  summary: string;
  documentation: { source: string; revision: string; pages: string[] };
  scenario: string;
  adapter: { source: string; tenant: string; properties: MewsPropertyConfig[]; crosswalk: Crosswalk };
  identity: string;
  deliveries: MewsRecordedDelivery[];
  not_reproduced: Array<{ delivery: number; reason: string }>;
  differences: Array<{ delivery: number; field: string; reason: string }>;
};

// One HOS fact of the mixed stream, with the corpus delivery it stands for and, for mapped facts, the Mews delivery it came from.
export type MewsArrivalFact = { corpusDelivery: number; event: HosFact; mews?: MewsRecordedDelivery; unmapped: MewsUnmapped[] };

export function loadMewsRecording() {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public", mewsMappingPath, "arrival-readiness.json"), "utf8")) as MewsRecording;
}

export function buildMewsArrivalStream() {
  const { scenario, manifests, events } = loadArrivalScenario();
  const recording = loadMewsRecording();
  const adapter = createMewsAdapter({ ...recording.adapter, identities: createIdentityRegistry(recording.adapter.crosswalk) });
  const stream: MewsArrivalFact[] = [];

  events.forEach((event, index) => {
    const delivery = index + 1;
    if (event.source !== recording.adapter.source) {
      stream.push({ corpusDelivery: delivery, event, unmapped: [] });
      return;
    }
    // A Mews delivery takes the place of the first corpus delivery it reproduces; other PMS deliveries are covered by it or not reproduced.
    const mews = recording.deliveries.find((item) => item.reproduces[0] === delivery);
    if (!mews) return;
    const { events: mapped, unmapped } = adapter.handle({
      received_at: mews.received_at,
      webhook: mews.webhook,
      reservations: mews.fetched.flatMap((call) => call.response.Reservations ?? []),
      resources: mews.fetched.flatMap((call) => call.response.Resources ?? []),
    });
    mapped.forEach((fact, position) => stream.push({ corpusDelivery: mews.reproduces[position], event: fact, mews, unmapped }));
  });

  return { scenario, manifests, corpus: events, recording, stream };
}

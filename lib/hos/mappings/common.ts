import type { Crosswalk, Disposition, HosFact } from "@hos-ai/sdk";

// Shared by the experimental PMS mappings: what a mapping reports, and the recording format that replays a PMS's own
// payloads through its adapter. Identities, time handling and the HOS envelope come from @hos-ai/sdk.

// A PMS event, or part of one, that did not become a HOS fact, and why.
export type Unmapped = { event: string; id: string; reason: string };
export type MappingResult = { events: HosFact[]; unmapped: Unmapped[] };

// --- Recordings: a PMS's payloads for the arrival-readiness scenario, replayed through its adapter ---

export type RecordedCall = { operation: string; request: Record<string, unknown>; response: unknown };

export type RecordedDelivery = {
  delivery: string;
  // The corpus delivery each mapped fact stands for, in order; null marks a fact the corpus does not have.
  reproduces: Array<number | null>;
  received_at: string;
  note: string;
  webhook: unknown;
  // Set when the webhook payload is reconstructed rather than taken from a published source.
  webhook_verification?: string;
  fetched: RecordedCall[];
};

export type MappingSource = { label: string; url: string; revision?: string; official: boolean; covers: string };

export type MappingRecording = {
  mapping: string;
  pms: string;
  hosschemaversion: "0.1";
  status: "experimental";
  title: string;
  summary: string;
  sources: MappingSource[];
  scenario: string;
  // The adapter's configuration, specific to each PMS, and the id crosswalk.
  adapter: { source: string; tenant: string; properties: unknown[]; crosswalk: Crosswalk };
  identity: string;
  deliveries: RecordedDelivery[];
  not_reproduced: Array<{ delivery: number; reason: string }>;
  differences: Array<{ delivery: number; field: string; reason: string }>;
  additions: Array<{ delivery: string; type: string; disposition: Disposition; reason: string }>;
};

export type RecordingAdapter = (delivery: RecordedDelivery) => MappingResult;

export const responses = <T>(delivery: RecordedDelivery) => delivery.fetched.map((call) => call.response as T);

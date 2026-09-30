import type { ProducerManifest } from "@hos-ai/sdk";

import { liveManifest, type MappingCapabilities, type SyncOptions } from "@/lib/hos/mappings/sync";
import type { ProducerConfig } from "@/lib/hos/producer/delivery";

// The manifest of a PMS mapping run as the pilot's persistent producer. It declares what the journal does, from the
// configuration the purge applies, so it never promises more than the producer keeps.
export function producerManifest(options: SyncOptions, capabilities: MappingCapabilities, { retentionDays }: ProducerConfig): ProducerManifest {
  return {
    ...liveManifest(options, capabilities),
    name: `${capabilities.name} (pilot producer)`,
    // Consumers read the journal from their position, or a JSON Lines export of it. The journal keeps the order facts
    // were written in, not the order they happened in, so it promises no ordering.
    delivery: { mechanisms: ["polling", "file"], guarantee: "at-least-once", ordering: "none" },
    replay: { supported: true, window_days: retentionDays, format: "jsonl" },
    retention: { event_days: retentionDays },
    limitations: capabilities.limitations,
  };
}

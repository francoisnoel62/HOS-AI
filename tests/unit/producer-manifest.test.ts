import { validateManifest } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import { apaleoCapabilities, apaleoManifest } from "@/lib/hos/mappings/apaleo-sync";
import { mewsCapabilities, mewsManifest } from "@/lib/hos/mappings/mews-sync";
import { producerManifest } from "@/lib/hos/producer/manifest";

const options = { source: "urn:hos:pms:pilot", tenant: "tenant_pilot", propertyId: "prop_pilot" };

describe.each([
  ["Mews", mewsCapabilities, mewsManifest],
  ["Apaleo", apaleoCapabilities, apaleoManifest],
] as const)("%s pilot producer manifest", (_name, capabilities, liveCheck) => {
  it("declares the replay and retention the journal applies, and publishes what the mapping publishes", () => {
    const manifest = producerManifest(options, capabilities, { retentionDays: 30 });
    expect(validateManifest(manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(manifest).toMatchObject({
      name: `${capabilities.name} (pilot producer)`,
      delivery: { mechanisms: ["polling", "file"], guarantee: "at-least-once", ordering: "none" },
      replay: { supported: true, window_days: 30, format: "jsonl" },
      retention: { event_days: 30 },
      limitations: capabilities.limitations,
    });
    expect(manifest.events).toEqual(liveCheck(options).events);
  });

  it("leaves the live check's manifest as it was, retaining nothing", () => {
    const manifest = liveCheck(options);
    expect(manifest).toMatchObject({ name: `${capabilities.name} (live check)`, replay: { supported: false }, retention: { event_days: 0 } });
    expect(manifest.limitations).toContain("Nothing is retained: each run starts from an empty crosswalk.");
  });
});

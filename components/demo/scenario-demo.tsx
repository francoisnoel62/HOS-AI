import type { Metadata } from "next";

import { PageHero } from "@/components/content/page-hero";
import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { ConformanceKit } from "@/components/demo/conformance-kit";
import { producerLabels } from "@/components/demo/producer-labels";
import { ScenarioNav } from "@/components/demo/scenario-nav";
import { scenarioDemos } from "@/lib/content/scenarios";
import { type ConformanceScenarioId, loadScenario } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";

export const scenarioMetadata = (id: ConformanceScenarioId): Metadata => ({ title: scenarioDemos[id].metaTitle, description: scenarioDemos[id].metaDescription });

// The hero, the scenario switcher, the live replay and the conformance kit of one scenario.
export function ScenarioDemo({ id }: { id: ConformanceScenarioId }) {
  const demo = scenarioDemos[id];
  const { scenario, manifests, events } = loadScenario(id);
  const steps = replayArrivalReadiness(events, manifests, scenario.projection);

  return (
    <>
      <PageHero eyebrow="Live demo" title={demo.title} description={demo.description} badge="HOS Events 0.1 · Observe · Synthetic data" />
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <ScenarioNav current={id} />
        <ArrivalReplay notes={scenario.deliveries} producerLabels={producerLabels(manifests)} stayId={demo.stayId} steps={steps} timezone={scenario.property.timezone} />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Times are shown in the property time zone ({scenario.property.timezone}). HOS 0.1 only observes: it does not reassign the room, message the guest or change the booking. The projection on this page is the non-normative reference implementation, run against the published files below.
        </p>
      </section>
      <ConformanceKit id={id} />
    </>
  );
}

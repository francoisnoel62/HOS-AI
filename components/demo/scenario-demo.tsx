import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import type { Metadata } from "next";

import { PageHero } from "@/components/content/page-hero";
import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { ConformanceKit } from "@/components/demo/conformance-kit";
import { producerLabels } from "@/components/demo/producer-labels";
import { ScenarioNav } from "@/components/demo/scenario-nav";
import { scenarioDemos } from "@/lib/content/scenarios";
import { type ConformanceScenarioId, loadScenario } from "@/lib/spec";

export const scenarioMetadata = (id: ConformanceScenarioId): Metadata => ({
  title: scenarioDemos[id].metaTitle,
  description: scenarioDemos[id].metaDescription,
});

// What each part of the replay shows, for readers who do not know the event types.
const readingGuide = [
  [
    "The updates",
    "What each system sends, in the order HOS receives it. A badge says what HOS did with it: applied, ignored as a duplicate, refused, and so on.",
  ],
  ["The arrival", "What HOS knows about this guest's arrival after each update, and which system each piece of information comes from."],
  ["The alert", "When HOS raises or clears an alert, it appears in the standard's own format, ready for other systems to use."],
];

// The hero, the scenario switcher, the live replay and the conformance kit of one scenario.
export function ScenarioDemo({ id }: { id: ConformanceScenarioId }) {
  const demo = scenarioDemos[id];
  const { scenario, manifests, events } = loadScenario(id);
  const steps = replayArrivalReadiness(events, manifests, scenario.projection);

  return (
    <>
      <PageHero eyebrow="Live demo" title={demo.title} description={demo.description} badge="Made-up data · HOS 0.1" />
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <ScenarioNav current={id} />
        <div className="mb-6">
          <p className="eyebrow">How to read the replay</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {readingGuide.map(([title, text]) => (
              <li className="rounded-md border border-[var(--border)] p-4 text-sm leading-6" key={title}>
                <span className="font-medium">{title}</span>
                <span className="mt-1 block text-[var(--muted-foreground)]">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <ArrivalReplay
          notes={scenario.deliveries}
          producerLabels={producerLabels(manifests)}
          stayId={demo.stayId}
          steps={steps}
          timezone={scenario.property.timezone}
        />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Times are local to the hotel ({scenario.property.timezone}). HOS 0.1 only raises alerts: it does not move the guest, message them or change
          the booking. For technical readers: the projection on this page is the non-normative reference implementation, run against the published
          files below.
        </p>
      </section>
      <ConformanceKit id={id} />
    </>
  );
}

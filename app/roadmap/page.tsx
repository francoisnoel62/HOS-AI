import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { RoadmapTrack } from "@/components/content/roadmap-track";
import { SectionFrame } from "@/components/content/section-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "The directional progression from observation to a trustworthy agentic hospitality ecosystem.",
};

// Where Observe stands since the founder closed it on 1 October 2026: what was shown, and what still needs a hotel.
const observe = [
  [
    "Shown",
    "The HOS Core and HOS Events drafts, the hos command and the SDK, three replayable arrival scenarios, and producers for Mews and Apaleo that keep their facts across restarts and sign their manifests. Both ran read-only against the demo environments of Mews and Apaleo.",
  ],
  [
    "Still open",
    "No hotel has run the early-arrival scenario yet, and no hotel operator, PMS vendor or integrator has reviewed it. Observe closed so that work on Act can start; this proof stays open, and its results will be published when a pilot hotel brings them.",
  ],
];

export default function RoadmapPage() {
  return (
    <>
      <PageHero
        eyebrow="Roadmap"
        title="A directional path, not a calendar promise."
        description="HOS uses successive proof points rather than commercial dates. Observe closed on 1 October 2026, on the evidence of demo environments, and Act is the work now, as a draft. Later phases open only when the initiative decides the operational, technical and governance conditions are right."
        badge="Act · Now"
      />
      <SectionFrame eyebrow="Five stages" title="Observe → Act → Trust → Agents → Ecosystem">
        <RoadmapTrack />
      </SectionFrame>
      <SectionFrame eyebrow="Observe, closed" title="What Observe showed, and the proof that still needs a hotel.">
        <div className="grid gap-4 md:grid-cols-2">
          {observe.map(([title, text]) => (
            <Card className="p-6" key={title}>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="What opens the next stage" title="New power follows evidence, not a marketing timetable.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Observe", "Core events, capabilities, replayable arrival scenario and real mapping evidence."],
            ["Act", "A declared authority system, a valid capability, policy and explicit human approval."],
            ["Trust & beyond", "Auditable policy decisions, testable controls and governance mature enough for the responsibility."],
          ].map(([title, text]) => (
            <Card className="p-6" key={title}>
              <p className="font-mono text-xs text-[var(--accent)]">Opening condition</p>
              <h2 className="mt-4 text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>
      <section className="mx-auto max-w-6xl px-5 pb-20 lg:px-8">
        <Card className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Partner hotels wanted</p>
            <p className="mt-2 max-w-xl text-lg font-medium tracking-[-0.025em]">
              We are looking for hotels on Mews or Apaleo to run the early-arrival scenario with us, read-only.
            </p>
          </div>
          <Link href="/participate/pilot">
            <Button>Run a pilot</Button>
          </Link>
        </Card>
      </section>
    </>
  );
}

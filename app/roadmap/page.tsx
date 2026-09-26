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

export default function RoadmapPage() {
  return (
    <>
      <PageHero
        eyebrow="Roadmap"
        title="A directional path, not a calendar promise."
        description="HOS uses successive proof points rather than commercial dates. Observe is the work now; later phases open only when the initiative decides the operational, technical and governance conditions are right."
        badge="Observe · Now"
      />
      <SectionFrame eyebrow="Five stages" title="Observe → Act → Trust → Agents → Ecosystem">
        <RoadmapTrack />
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
            <p className="eyebrow">Start where the evidence is</p>
            <p className="mt-2 max-w-xl text-lg font-medium tracking-[-0.025em]">
              The first public focus is a precise, testable arrival-readiness scenario.
            </p>
          </div>
          <Link href="/standard">
            <Button>Explore the standard</Button>
          </Link>
        </Card>
      </section>
    </>
  );
}

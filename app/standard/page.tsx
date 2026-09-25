import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { RoadmapTrack } from "@/components/content/roadmap-track";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadArrivalScenario } from "@/lib/hos/conformance";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = { title: "The Standard", description: "Why HOS exists, how its operating contract works and what can be inspected today." };

export default function StandardPage() {
  const eventExample = JSON.stringify(loadArrivalScenario().events[3], null, 2);
  return (
    <>
      <PageHero eyebrow="The Standard" title="An operating contract for systems that need to work together." description="HOS makes facts, authority, capability and future controlled action portable between hospitality systems. It complements existing standards and maps to their strengths; it does not replace a PMS, require a cloud or control a vendor." badge="HOS Core 0.1 · Draft" />
      <SectionFrame eyebrow="Why HOS" title="Operational interoperability is the missing layer.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Portable", "An event has a typed meaning across systems, not only inside one integration."],
            ["Traceable", "Every fact carries its source, occurrence time and relevant authority instead of an invisible merged truth."],
            ["Progressive", "The same foundation moves from observation to approval-bound action without demanding premature autonomy."],
          ].map(([title, text]) => <Card className="p-6" key={title}><h2 className="text-xl font-semibold tracking-[-0.04em]">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
        </div>
      </SectionFrame>
      <section className="mx-auto max-w-6xl px-5 lg:px-8">
        <Link className="group block" href="/standard/htng-opentravel">
          <Card className="flex flex-col gap-4 border-[var(--accent)] bg-[var(--accent-soft)] p-6 transition-colors sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">HOS, HTNG and OpenTravel</p>
              <p className="mt-2 max-w-2xl text-xl font-semibold tracking-[-0.03em]">They carry the messages. HOS makes the facts trustworthy.</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">What each standard answers, where HOS adds to them, and where it is still behind.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--accent-strong)] group-hover:underline">
              Read the comparison <ArrowRight aria-hidden="true" size={15} />
            </span>
          </Card>
        </Link>
      </section>
      <SectionFrame eyebrow="How it works" title="A small Core, events with provenance, declared capabilities and a path to trust.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            {[
              ["Core", "Tenant, Property, Unit, Reservation, Stay, Task, pseudonymous Guest and minimal Message."],
              ["Events", "CloudEvents-compatible facts with HOS business date, property time zone, causal links and version."],
              ["Capabilities", "Each producer publishes the events it can provide, source authority, replay and retention limits."],
              ["Trust", "Later actions are default-deny, tenant-scoped, policy-evaluated, approved and auditable."],
            ].map(([title, text]) => <Card className="p-5" key={title}><h3 className="font-mono text-sm text-[var(--accent)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
          </div>
          <div className="min-w-0"><CodePanel label="CloudEvents-compatible event · synthetic" code={eventExample} /><p className="mt-3 text-sm"><Link className="text-[var(--accent-strong)] underline" href="/docs/events#envelope">Every attribute, explained in HOS Events 0.1</Link></p></div>
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Inspect the contract" title="Technical detail is available when you need it.">
        <div className="grid gap-4 md:grid-cols-2"><Card className="p-6"><h2 className="text-xl font-semibold">Documentation status</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Published materials stay visible; incomplete materials are labelled honestly. There are no fake endpoints or sample credentials.</p><Link className="mt-5 inline-block" href="/docs"><Button variant="secondary">View documentation</Button></Link></Card><Card className="p-6"><h2 className="text-xl font-semibold">Contribute through GitHub</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Schemas, mappings, tests and documentation will be discussed and improved in the open repository.</p><a className="mt-5 inline-block" href={siteConfig.githubUrl} rel="noreferrer" target="_blank"><Button>Open GitHub</Button></a></Card></div>
      </SectionFrame>
      <SectionFrame eyebrow="Trajectory" title="HOS starts by observing; it earns the right to do more."><RoadmapTrack /></SectionFrame>
    </>
  );
}

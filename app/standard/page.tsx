import type { Metadata } from "next";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { RoadmapTrack } from "@/components/content/roadmap-track";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "The Standard", description: "Why HOS exists, how its operating contract works and what can be inspected today." };

const eventExample = `{
  "specversion": "1.0",
  "type": "unit.status_changed",
  "source": "urn:hos:pms:example",
  "id": "0190f6d0-…",
  "time": "2026-07-30T09:15:00Z",
  "hosrecordedat": "2026-07-30T09:15:02Z",
  "hosbusinessdate": "2026-07-30",
  "data": {
    "unit_id": "unit_01H…",
    "dimension": "housekeeping",
    "previous": "clean",
    "current": "dirty",
    "authority": "housekeeping"
  }
}`;

export default function StandardPage() {
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
      <SectionFrame eyebrow="How it works" title="A small Core, events with provenance, declared capabilities and a path to trust.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            {[
              ["Core", "Property, Unit, Reservation, Stay, Task, pseudonymous Guest and minimal Message."],
              ["Events", "CloudEvents-compatible facts with HOS business date, property time zone, causal links and version."],
              ["Capabilities", "Each producer publishes the events it can provide, source authority, replay and retention limits."],
              ["Trust", "Later actions are default-deny, tenant-scoped, policy-evaluated, approved and auditable."],
            ].map(([title, text]) => <Card className="p-5" key={title}><h3 className="font-mono text-sm text-[var(--accent)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
          </div>
          <CodePanel label="CloudEvents-compatible event" code={eventExample} />
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Inspect the contract" title="Technical detail is available when you need it.">
        <div className="grid gap-4 md:grid-cols-2"><Card className="p-6"><h2 className="text-xl font-semibold">Documentation status</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Published materials stay visible; incomplete materials are labelled honestly. There are no fake endpoints or sample credentials.</p><Link className="mt-5 inline-block" href="/docs"><Button variant="secondary">View documentation</Button></Link></Card><Card className="p-6"><h2 className="text-xl font-semibold">Contribute through GitHub</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Schemas, mappings, tests and documentation will be discussed and improved in the open repository.</p><a className="mt-5 inline-block" href="https://github.com/hos-ai" rel="noreferrer" target="_blank"><Button>Open GitHub</Button></a></Card></div>
      </SectionFrame>
      <SectionFrame eyebrow="Trajectory" title="HOS starts by observing; it earns the right to do more."><RoadmapTrack /></SectionFrame>
    </>
  );
}

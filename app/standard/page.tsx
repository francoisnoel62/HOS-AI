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
      <PageHero eyebrow="The Standard" title="An operating contract for systems that need to work together." description="HOS is a shared set of rules that lets a PMS, a housekeeping tool, a messaging platform and, later, AI tools describe the same situation in the same way. It works alongside existing standards and builds on their strengths. It does not replace your PMS, require a cloud or tell any vendor how to build its product." badge="HOS Core 0.1 · Draft" />
      <SectionFrame eyebrow="Why HOS" title="What hotel systems lack: a shared language.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Same meaning everywhere", "A room status, a booking change or a finished cleaning task means the same thing in every system, not just inside one integration."],
            ["Always traceable", "Every piece of information says which system it came from, when it happened and whether that system is the official source. Nothing is quietly merged."],
            ["One step at a time", "The same foundation that spots problems today will later support actions, always with your team's approval, and gives AI no freedom it has not earned."],
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
      <SectionFrame eyebrow="How it works" title="Four building blocks." description="In brief: a shared vocabulary, a standard format for updates, a statement of what each system provides, and rules for future actions. Each block gives its name in the specification, for technical teams.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            {[
              ["Core", "A shared vocabulary for the hotel group, the property, its rooms and their maintenance, bookings, stays, tasks, guests (never by name) and messages. In the specification: Tenant, Property, Unit, Maintenance window, Reservation, Stay, Task, Guest and Message."],
              ["Events", "Every change travels as a standard update that says where it comes from, the hotel's local date and time zone, what caused it and which version of HOS it follows. In the specification: CloudEvents-compatible events."],
              ["Capabilities", "Each system publishes what it can send, what it is the official source for, and how long it keeps and can replay its updates. In the specification: the Event Producer manifest."],
              ["Trust", "Future actions will be refused unless allowed, limited to one organisation's data, checked against the hotel's rules, approved and recorded. In the specification: default-deny, tenant-scoped, auditable policies."],
            ].map(([title, text]) => <Card className="p-5" key={title}><h3 className="font-mono text-sm text-[var(--accent)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
          </div>
          <div className="min-w-0"><CodePanel label="Example: housekeeping reports room 204 dirty after a departure · synthetic" code={eventExample} /><p className="mt-3 text-sm"><Link className="text-[var(--accent-strong)] underline" href="/docs/events#envelope">Every attribute, explained in HOS Events 0.1</Link></p></div>
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Inspect the contract" title="Technical detail is available when you need it.">
        <div className="grid gap-4 md:grid-cols-2"><Card className="p-6"><h2 className="text-xl font-semibold">Documentation status</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Everything published can be read, and unfinished work is labelled as such. There are no fake endpoints or sample credentials.</p><Link className="mt-5 inline-block" href="/docs"><Button variant="secondary">View documentation</Button></Link></Card><Card className="p-6"><h2 className="text-xl font-semibold">Contribute through GitHub</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Schemas, mappings, tests and documentation will be discussed and improved in the open repository.</p><a className="mt-5 inline-block" href={siteConfig.githubUrl} rel="noreferrer" target="_blank"><Button>Open GitHub</Button></a></Card></div>
      </SectionFrame>
      <SectionFrame eyebrow="Trajectory" title="HOS starts by observing; it earns the right to do more."><RoadmapTrack /></SectionFrame>
    </>
  );
}

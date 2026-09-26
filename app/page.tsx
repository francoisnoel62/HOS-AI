import { ArrowRight, Braces, CircleCheck, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";

import { AudienceSelector } from "@/components/content/audience-selector";
import { SectionFrame } from "@/components/content/section-frame";
import { EventFlowDiagram, PmsProofCard, ReadinessRiskCard } from "@/components/diagrams/event-flow-diagram";
import { ParticipationCard } from "@/components/participation/participation-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { participationPaths } from "@/lib/content/site-copy";

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:px-8 lg:pb-24">
        <div>
          <Badge variant="active">An open standard for hotel operations</Badge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.07em] sm:text-6xl lg:text-7xl">
            Hospitality operations need an operating layer for the agentic era.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
            The PMS knows the booking. Housekeeping knows the room. The messaging tool knows the guest is coming early. HOS is an open standard designed to let them share one picture, so your team sees problems before guests do, and tomorrow&apos;s AI tools work under your rules.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/participate/pilot"><Button size="lg">Run a pilot <ArrowRight aria-hidden="true" size={17} /></Button></Link>
            <Link href="/participate/founding-member"><Button size="lg" variant="secondary">Become a founding member</Button></Link>
          </div>
          <p className="mt-7 max-w-xl border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--muted-foreground)]">
            AI is arriving in hotel operations. Hotels and software vendors that prepare now keep the choice of their tools and partners.
          </p>
        </div>
        <EventFlowDiagram />
      </section>

      <SectionFrame eyebrow="The problem" title="A simple arrival decision is rarely simple." description="A guest writes to say they will arrive early. The PMS expects them this afternoon. Housekeeping still has the room as dirty. Each system holds part of the answer, and nobody sees the whole situation until the guest is at the front desk.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] md:grid-cols-3">
          {[
            ["Every system names things differently", "The same booking, guest and room carry a different reference in each system. Matching them takes a custom integration, every time."],
            ["Systems disagree", "The PMS shows the room as clean; housekeeping has not inspected it yet. Your team has to know which one to believe."],
            ["AI without rules", "An AI tool cannot be trusted to act in a hotel until it is clear what it may do, who approves it and what it did."],
          ].map(([title, text], index) => (
            <div className="bg-[var(--card)] p-6" key={title}>
              <span className="font-mono text-xs text-[var(--accent)]">0{index + 1}</span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="First proof" title="See the problem before the guest does." description="HOS starts with one everyday situation: a guest arriving to a room that is not ready. It is tested on three cases: an early arrival, a room going out of order on the morning of arrival, and a late check-out in a room promised to someone else. HOS raises the alert and shows where each piece of information comes from. It never checks a guest in, moves a guest or changes a booking: your team stays in charge.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ReadinessRiskCard />
          <PmsProofCard />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/demo"><Button>Watch it step by step <ArrowRight aria-hidden="true" size={16} /></Button></Link>
          <Link href="/docs/core"><Button variant="secondary">Read the technical specification</Button></Link>
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="What HOS brings" title="One shared picture. Clear rules. AI you control.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { Icon: Braces, title: "Systems that understand each other", text: "A booking, a room or a cleaning task means the same thing in every system that speaks HOS, and each piece of information says where it came from." },
            { Icon: ShieldCheck, title: "You stay in charge", text: "Each hotel's data stays separate, each system states what it is responsible for, and anything that happens can be checked afterwards." },
            { Icon: Workflow, title: "AI, one step at a time", text: "HOS starts by spotting problems. Suggestions come next, then actions your team approves. AI gets more freedom only once it has earned it." },
          ].map(({ Icon, title, text }) => (
            <Card className="p-6" key={title}><Icon aria-hidden="true" className="text-[var(--accent)]" size={21} /><h3 className="mt-8 text-xl font-semibold tracking-[-0.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="Who it's for" title="Hotels and their software partners gain from the same standard.">
        <AudienceSelector />
      </SectionFrame>

      <SectionFrame eyebrow="Trust by design" title="Nothing hidden, nothing taken for granted.">
        <ul className="grid gap-3 md:grid-cols-2">
          {[
            "HOS does not require a new platform, a cloud or a central database.",
            "Every system states what it knows and what it is the official source for.",
            "When two systems disagree, HOS shows both. It never quietly picks a winner.",
            "HOS keeps only the guest data it needs, without names. Message content stays in your messaging tool.",
            "When HOS allows actions, nothing will happen unless you have allowed it, and every action will be recorded.",
            "Public tests use made-up or fully anonymised data only, never real guest records.",
          ].map((item) => <li className="flex gap-3 rounded-md border border-[var(--border)] p-4 text-sm leading-6" key={item}><CircleCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent)]" size={17} />{item}</li>)}
        </ul>
      </SectionFrame>

      <SectionFrame className="border-t border-[var(--border)]" eyebrow="Get involved" title="Find the role that fits your organisation." description="Early participants shape HOS around how hotels really work. Nobody gets exclusive rights over the standard, over anyone's data or over future certification.">
        <div className="grid gap-4 md:grid-cols-2">
          {participationPaths.map((path, index) => <ParticipationCard {...path} featured={index === 0} key={path.slug} />)}
        </div>
      </SectionFrame>

      <section className="border-t border-[var(--border)] bg-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-5 py-16 sm:py-20 lg:flex-row lg:items-end lg:px-8">
          <div><p className="eyebrow">Build it with us</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">Help hotels and their software speak the same language.</h2></div>
          <div className="flex flex-wrap gap-3"><Link href="/participate/pilot"><Button size="lg">Run a pilot</Button></Link><Link href="/docs"><Button size="lg" variant="secondary">Explore documentation</Button></Link></div>
        </div>
      </section>
    </>
  );
}

import { ArrowRight, Braces, CircleCheck, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";

import { AudienceSelector } from "@/components/content/audience-selector";
import { SectionFrame } from "@/components/content/section-frame";
import { EventFlowDiagram, ReadinessRiskCard } from "@/components/diagrams/event-flow-diagram";
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
          <Badge variant="active">Hospitality Operating Specification for Agentic Infrastructure</Badge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.07em] sm:text-6xl lg:text-7xl">
            Hospitality operations need an operating layer for the agentic era.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
            AI is becoming an operational priority for hospitality leaders. HOS AI is building an open specification that makes operational facts, capabilities and controlled actions portable across hospitality systems.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/participate/founding-member"><Button size="lg">Become a founding member <ArrowRight aria-hidden="true" size={17} /></Button></Link>
            <Link href="/participate/pilot"><Button size="lg" variant="secondary">Run a pilot</Button></Link>
          </div>
          <p className="mt-7 max-w-xl border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--muted-foreground)]">
            Organizations that do not prepare for agentic operations risk losing relevance, interoperability and strategic choice.
          </p>
        </div>
        <EventFlowDiagram />
      </section>

      <SectionFrame eyebrow="The operating problem" title="A simple arrival decision is rarely simple." description="PMS, housekeeping, guest messaging, integrations and emerging agents do not yet share a portable, safe operational contract.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] md:grid-cols-3">
          {[
            ["Different identifiers", "Reservation, guest, property and unit references do not resolve cleanly across systems."],
            ["Conflicting facts", "A unit can be sellable in one source and still dirty in another. Authority needs to stay visible."],
            ["Uncontrolled actions", "An agent cannot safely act if capabilities, policies, approvals and audit evidence are unknown."],
          ].map(([title, text], index) => (
            <div className="bg-[var(--card)] p-6" key={title}>
              <span className="font-mono text-xs text-[var(--accent)]">0{index + 1}</span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="First proof" title="Observe room readiness before it becomes an escalation." description="HOS 0.1 begins with an early-arrival, room-not-ready scenario. It projects a situation from traceable events; it does not autonomously check a guest in or alter a booking.">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <EventFlowDiagram />
          <ReadinessRiskCard />
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="What HOS makes portable" title="Facts, control and a path to agency.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { Icon: Braces, title: "Interoperable facts", text: "Versioned events, stable references, provenance and declared capabilities." },
            { Icon: ShieldCheck, title: "Trustworthy control", text: "Tenant boundaries, visible authority, approval and conformance evidence." },
            { Icon: Workflow, title: "Agent-ready operations", text: "A clear progression from observation to recommendations, controlled actions and bounded autonomy." },
          ].map(({ Icon, title, text }) => (
            <Card className="p-6" key={title}><Icon aria-hidden="true" className="text-[var(--accent)]" size={21} /><h3 className="mt-8 text-xl font-semibold tracking-[-0.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="Built for the whole operating ecosystem" title="The same contract, a different practical gain for every participant.">
        <AudienceSelector />
      </SectionFrame>

      <SectionFrame eyebrow="Trust by design" title="The contract refuses invisible assumptions.">
        <ul className="grid gap-3 md:grid-cols-2">
          {[
            "Event-first: no required broker, cloud or central database.",
            "Capabilities and sources of authority are explicitly declared.",
            "Conflicting facts remain traceable; HOS never silently merges a truth.",
            "Core data is minimal and pseudonymous; message content stays with its authority system.",
            "Future action is default-deny, policy-bound and auditable.",
            "Public conformance relies on synthetic or irreversibly anonymised material only.",
          ].map((item) => <li className="flex gap-3 rounded-md border border-[var(--border)] p-4 text-sm leading-6" key={item}><CircleCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent)]" size={17} />{item}</li>)}
        </ul>
      </SectionFrame>

      <SectionFrame className="border-t border-[var(--border)]" eyebrow="Participate" title="Choose the contribution that matches your role." description="Early participation gives the work its operational grounding. It does not create exclusive rights over the standard, member data or future certification.">
        <div className="grid gap-4 md:grid-cols-2">
          {participationPaths.map((path, index) => <ParticipationCard {...path} featured={index === 0} key={path.slug} />)}
        </div>
      </SectionFrame>

      <section className="border-t border-[var(--border)] bg-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-5 py-16 sm:py-20 lg:flex-row lg:items-end lg:px-8">
          <div><p className="eyebrow">Make the operating layer open</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">Build the transition to interoperable, trustworthy hospitality operations.</h2></div>
          <div className="flex flex-wrap gap-3"><Link href="/participate/founding-member"><Button size="lg">Become a founding member</Button></Link><Link href="/docs"><Button size="lg" variant="secondary">Explore documentation</Button></Link></div>
        </div>
      </section>
    </>
  );
}

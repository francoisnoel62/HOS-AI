import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Governance", description: "The public commitments guiding HOS AI toward independent stewardship." };

export default function GovernancePage() {
  return (
    <>
      <PageHero eyebrow="Governance" title="Build the commons in public, then steward it independently." description="HOS AI is an early-stage initiative working toward an independent HOS Foundation that aims to make hospitality operations interoperable, trustworthy and agent-ready." badge="Early-stage initiative" />
      <SectionFrame eyebrow="Public commitments" title="Neutrality is a practice, not a claim.">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Open standard", "The specification is intended for CC BY 4.0; code artefacts use Apache-2.0. Marks and editorial content remain separately protected."],
            ["Traceable decisions", "The work records its decisions and conflicts of interest so they can be inspected rather than assumed."],
            ["Independent direction", "The intended destination is a member-led HOS Association operating with one organisation, one vote."],
            ["Participation safeguards", "Funding, code and early contribution do not create exclusive rights over the standard, data or certification."],
          ].map(([title, text]) => <Card className="p-6" key={title}><h2 className="text-xl font-semibold tracking-[-0.04em]">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Stewardship path" title="Independent governance is an objective with visible conditions.">
        <ol className="grid gap-3 md:grid-cols-3"><li className="border-l-2 border-[var(--accent)] pl-4"><p className="eyebrow">Today</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Publish a clear charter, public artefacts and a path for qualified participants.</p></li><li className="border-l-2 border-[var(--border-strong)] pl-4"><p className="eyebrow">Formation</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Convene independent organisations across hospitality operations, PMS and the wider ecosystem.</p></li><li className="border-l-2 border-[var(--border-strong)] pl-4"><p className="eyebrow">Destination</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Transfer stewardship to an independent HOS Association aligned with the public commitments.</p></li></ol>
        <Link className="mt-10 inline-block" href="/manifesto"><Button>Read the manifesto</Button></Link>
      </SectionFrame>
    </>
  );
}

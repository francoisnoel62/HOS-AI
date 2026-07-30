import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Data Cooperative", description: "A future opt-in HOS Data Cooperative, explained without collecting data today." };

export default function DataCooperativePage() {
  return (
    <>
      <PageHero eyebrow="Data Cooperative" title="Collective intelligence needs a separate, purpose-limited home." description="The HOS Data Cooperative is a future, optional programme — not a feature of HOS Core and not an active service. It will never begin through this website or a simple commercial agreement." badge="Not active yet" />
      <SectionFrame eyebrow="The intended model" title="Control stays with the operator.">
        <ol className="grid gap-3 md:grid-cols-4">
          {[ ["01", "Operator control", "Each contributor chooses the permitted purpose, access, duration and withdrawal."], ["02", "Purpose-limited data", "Only data necessary and explicitly authorised for a defined purpose can be processed."], ["03", "Aggregated benchmarks", "The first value would be controlled operational benchmarks, not traveller personalisation."], ["04", "Future opt-in models", "Any model-training programme would require a separate contract, risk review and explicit opt-in."], ].map(([number, title, text]) => <Card className="p-5" key={number}><span className="font-mono text-xs text-[var(--accent)]">{number}</span><h2 className="mt-6 text-lg font-semibold tracking-[-0.04em]">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></Card>)}
        </ol>
      </SectionFrame>
      <SectionFrame eyebrow="What is deliberately absent" title="No upload, benchmark, waitlist or data promise today.">
        <div className="grid gap-4 md:grid-cols-2"><Card className="p-6"><Badge variant="warning">Roadmap only</Badge><p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">No operational or guest data is requested on the public site. HOS Core remains separate from any collective data activity.</p></Card><Card className="p-6"><Badge>Future conditions</Badge><p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">A cooperative would need pilot evidence, data contracts, risk review, independent voluntary organisations and operator-centred data governance before it operates.</p></Card></div>
        <Link className="mt-10 inline-block" href="/roadmap"><Button variant="secondary">Explore the roadmap</Button></Link>
      </SectionFrame>
    </>
  );
}

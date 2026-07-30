import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Manifesto", description: "The HOS AI public statement of purpose." };

export default function ManifestoPage() {
  return <><PageHero eyebrow="Manifesto" title="Hospitality should own an open path into the agentic era." description="HOS AI is an early-stage initiative working toward an independent HOS Foundation that aims to make hospitality operations interoperable, trustworthy and agent-ready." /><article className="mx-auto max-w-3xl px-5 pb-20 text-lg leading-8 text-[var(--muted-foreground)] lg:px-8"><div className="space-y-7 border-t border-[var(--border)] pt-10"><p>Hospitality operations are becoming more connected, more automated and more consequential. Yet the facts needed to make a good decision remain fragmented across systems that do not share a portable operational language.</p><p>HOS exists to make that language open. It makes events, identifiers, provenance, capabilities and future controlled actions understandable across the systems that operate a property.</p><p>HOS does not ask the industry to surrender authority to a central database, a mandatory cloud or an opaque agent. It keeps authority visible, treats personal data with purpose and restraint, and makes action conditional on policy, approval and audit.</p><p>We start with a narrow operational proof because trust has to be earned. We publish what exists, call future work a roadmap, and invite operators, PMS providers, software vendors, integrators, developers and patrons to build the common layer together.</p></div><Link className="mt-10 inline-block" href="/participate"><Button size="lg">Participate in HOS AI</Button></Link></article></>;
}

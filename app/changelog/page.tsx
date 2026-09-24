import type { Metadata } from "next";
import { PageHero } from "@/components/content/page-hero";
import Link from "next/link";

import { StatusBadge } from "@/components/content/status-badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Changelog", description: "Published changes and decisions only." };

export default function ChangelogPage() {
  return <><PageHero eyebrow="Changelog" title="Nothing is announced before it exists." description="This changelog will list released artefacts and published decisions. HOS AI does not promise a content rhythm before the project has one." /><section className="mx-auto max-w-6xl px-5 pb-20 lg:px-8"><Card className="p-8"><div className="flex flex-wrap items-center gap-3"><p className="eyebrow">24 September 2026</p><StatusBadge status="Draft" /></div><h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em]">HOS Core 0.1 draft and the arrival-readiness scenario.</h2><ul className="mt-4 max-w-2xl space-y-2 text-sm leading-6 text-[var(--muted-foreground)]"><li>Readable draft of HOS Core 0.1: entities, event envelope, processing rules and the arrival-readiness projection.</li><li>JSON Schemas for HOS 0.1 events and Event Producer manifests.</li><li>A synthetic conformance scenario of nine deliveries with its expected outcome, and a live replay.</li></ul><div className="mt-5 flex flex-wrap gap-4 text-sm"><Link className="text-[var(--accent-strong)] underline" href="/docs/core">Read the draft</Link><Link className="text-[var(--accent-strong)] underline" href="/demo">Open the live demo</Link></div></Card></section></>;
}

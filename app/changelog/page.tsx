import type { Metadata } from "next";
import { PageHero } from "@/components/content/page-hero";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Changelog", description: "Published changes and decisions only." };

export default function ChangelogPage() {
  return <><PageHero eyebrow="Changelog" title="Nothing is announced before it exists." description="This changelog will list released artefacts and published decisions. HOS AI does not promise a content rhythm before the project has one." /><section className="mx-auto max-w-6xl px-5 pb-20 lg:px-8"><Card className="p-8"><p className="eyebrow">No public releases yet</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em]">The first entry will follow a real release or decision.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">Until then, the documentation page shows the honest state of the work.</p></Card></section></>;
}

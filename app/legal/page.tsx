import type { Metadata } from "next";
import { PageHero } from "@/components/content/page-hero";

export const metadata: Metadata = { title: "Legal notice", description: "Legal notice placeholder pending founder-owned production information." };

export default function LegalPage() {
  return <><PageHero eyebrow="Legal notice" title="Production legal identity must be accurate before publication." description="The marketing interface intentionally does not identify an individual founder. A public release still requires a complete legal notice identifying the responsible publisher, publication contact and host." badge="Founder-owned input required" /><section className="mx-auto max-w-3xl px-5 pb-20 lg:px-8"><div className="border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-6 text-sm leading-7 text-[var(--muted-foreground)]"><p className="font-semibold text-[var(--foreground)]">Local-development template only.</p><p className="mt-2">Before release, replace this text with reviewed legal details appropriate to the publication location and selected providers. Do not publish the website until this page is complete.</p></div></section></>;
}

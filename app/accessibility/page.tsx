import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/content/page-hero";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Accessibility", description: "HOS AI accessibility commitment and reporting route." };

export default function AccessibilityPage() {
  return <><PageHero eyebrow="Accessibility" title="Operational clarity includes accessible interfaces." description="HOS AI targets WCAG 2.2 AA for keyboard operation, focus visibility, contrast, text alternatives and motion preferences." /><article className="mx-auto max-w-3xl space-y-6 px-5 pb-20 text-sm leading-7 text-[var(--muted-foreground)] lg:px-8"><p>The site is designed to work by keyboard, preserve its diagrams in text, avoid colour-only status meaning and honour reduced-motion preferences. Forms use visible labels, inline instructions and server-side validation.</p><p>Accessibility is a continuous requirement. If an interface, document or diagram creates a barrier, please tell us what you were trying to do and what went wrong.</p><Link href="/contact"><Button>Report an accessibility issue</Button></Link></article></>;
}

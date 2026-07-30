import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formRouteKinds, isFormRouteKind } from "@/lib/forms/types";

type Props = { params: Promise<{ path: string }> };

export const metadata: Metadata = { title: "Submission received", robots: { index: false, follow: false } };
export const dynamicParams = false;

export function generateStaticParams() {
  return formRouteKinds.map((path) => ({ path }));
}

export default async function ThanksPage({ params }: Props) {
  const { path } = await params;
  if (!isFormRouteKind(path)) notFound();
  const label = path === "founding-member" ? "founding-member" : path === "pilot" ? "pilot" : path === "technical-contributor" ? "technical-contributor" : path === "financial-patron" ? "financial-patron" : "general inquiry";
  return <section className="mx-auto flex min-h-[65vh] max-w-3xl flex-col justify-center px-5 py-20 lg:px-8"><CheckCircle2 aria-hidden="true" className="text-[var(--accent)]" size={38} /><p className="eyebrow mt-7">Submission received</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.065em] sm:text-6xl">Thank you for your {label} interest.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">Your information has been recorded. The HOS AI team will qualify the request before proposing a conversation. No meeting is booked automatically.</p><div className="mt-8 flex gap-3"><Link href="/docs"><Button>Explore documentation</Button></Link><Link href="/"><Button variant="secondary">Return home</Button></Link></div></section>;
}

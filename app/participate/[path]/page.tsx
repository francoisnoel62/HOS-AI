import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FormMessage } from "@/components/forms/form-message";
import { SubmissionForm } from "@/components/forms/submission-form";
import { PageHero } from "@/components/content/page-hero";
import { Card } from "@/components/ui/card";
import { participationPaths } from "@/lib/content/site-copy";
import { isFormRouteKind } from "@/lib/forms/types";

type Props = { params: Promise<{ path: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const item = participationPaths.find((candidate) => candidate.slug === path);
  return item ? { title: item.title, description: item.description, robots: { index: false, follow: false } } : {};
}

export default async function ParticipationPathPage({ params, searchParams }: Props) {
  const { path } = await params;
  const { error } = await searchParams;
  const pathData = participationPaths.find((item) => item.slug === path);
  if (!pathData || !isFormRouteKind(path)) notFound();

  const bullets = path === "founding-member"
    ? ["Tell us which hospitality perspective you bring.", "Indicate whether you can later designate business and technical representatives.", "No financial amount or binding commitment is requested here."]
    : path === "pilot"
      ? ["Describe the arrival scenario, not customer data.", "Name systems at a category level; do not share credentials.", "A pilot does not promise production integration or economic results."]
      : path === "technical-contributor"
        ? ["Choose a contribution domain and a short description.", "GitHub profile details are optional; no account is linked.", "Any future CLA is reviewed separately, never accepted implicitly here."]
        : ["Choose the kind of support you are considering.", "No amount, payment, donation or tax claim is requested here.", "Patronage does not create special rights over data, certification or the standard."];

  return <>
    <PageHero eyebrow={pathData.eyebrow} title={pathData.title} description={pathData.description} />
    <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
      <aside className="border-t border-[var(--border)] pt-6"><p className="eyebrow">Before you start</p><ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]">{bullets.map((bullet) => <li className="flex gap-2" key={bullet}><span aria-hidden="true" className="text-[var(--accent)]">—</span>{bullet}</li>)}</ul></aside>
      <Card className="p-5 sm:p-8"><FormMessage error={error} /><SubmissionForm kind={path} /></Card>
    </section>
  </>;
}

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
    ? ["Tell us what you bring: the view of a hotel, a software vendor, an integrator…", "Let us know whether you could later name one business and one technical contact.", "No amount of money and no commitment is asked for here."]
    : path === "pilot"
      ? ["Describe the arrival situation you want to test. Never send guest data.", "You can name your systems, such as your PMS or housekeeping tool, but never share passwords or access keys.", "A pilot is a test: it does not promise a live integration or financial results."]
      : path === "technical-contributor"
        ? ["Choose the area you want to work on and describe it in a few lines.", "Your GitHub handle is optional; no account is connected.", "Any future contributor agreement (CLA) will be reviewed separately. Sending this form accepts nothing."]
        : ["Tell us what kind of support you are considering.", "No amount, payment or donation is asked for here, and no tax benefit is claimed.", "Patrons get no special rights over the standard, anyone's data or certification."];

  return <>
    <PageHero eyebrow={pathData.eyebrow} title={pathData.title} description={pathData.description} />
    <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
      <aside className="border-t border-[var(--border)] pt-6"><p className="eyebrow">Before you start</p><ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]">{bullets.map((bullet) => <li className="flex gap-2" key={bullet}><span aria-hidden="true" className="text-[var(--accent)]">—</span>{bullet}</li>)}</ul></aside>
      <Card className="p-5 sm:p-8"><FormMessage error={error} /><SubmissionForm kind={path} /></Card>
    </section>
  </>;
}

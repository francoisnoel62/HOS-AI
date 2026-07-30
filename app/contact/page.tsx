import type { Metadata } from "next";

import { PageHero } from "@/components/content/page-hero";
import { FormMessage } from "@/components/forms/form-message";
import { SubmissionForm } from "@/components/forms/submission-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Contact", description: "Send HOS AI a concise general inquiry without confidential information." , robots: { index: false, follow: false }};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <><PageHero eyebrow="Contact" title="A short, professional inquiry is enough to start." description="Please do not send guest data, credentials, system access, operational exports, detailed commercial information or any other confidential material through this public form." /><section className="mx-auto max-w-3xl px-5 pb-20 lg:px-8"><Card className="p-5 sm:p-8"><FormMessage error={error} /><SubmissionForm kind="contact" /></Card></section></>;
}

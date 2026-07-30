import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function ParticipationCard({
  slug,
  eyebrow,
  title,
  description,
  cta,
  featured = false,
}: {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "relative rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-6" : "rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"}>
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-3 text-xl font-semibold tracking-[-0.045em]">{title}</h3>
      <p className="mt-3 min-h-20 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
      <Link className="mt-6 inline-flex" href={`/participate/${slug}`}>
        <Button size="sm" variant={featured ? "default" : "secondary"}>{cta}<ArrowUpRight aria-hidden="true" size={15} /></Button>
      </Link>
    </article>
  );
}

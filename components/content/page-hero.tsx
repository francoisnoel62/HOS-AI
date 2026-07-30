import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function PageHero({ eyebrow, title, description, badge }: { eyebrow: string; title: ReactNode; description: ReactNode; badge?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:pb-16 sm:pt-24 lg:px-8">
      {badge ? <Badge variant="active">{badge}</Badge> : null}
      <p className="eyebrow mt-4">{eyebrow}</p>
      <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.065em] sm:text-6xl">{title}</h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{description}</p>
    </section>
  );
}

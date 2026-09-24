import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionFrame({
  eyebrow,
  title,
  description,
  children,
  className,
  id,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("mx-auto max-w-6xl scroll-mt-16 px-5 py-16 sm:py-24 lg:px-8", className)} id={id}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      {title ? <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">{title}</h2> : null}
      {description ? <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{description}</p> : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}

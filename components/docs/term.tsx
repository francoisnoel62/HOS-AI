"use client";

import Link from "next/link";
import { type ReactNode, useId, useState } from "react";

import { findGlossaryEntry } from "@/lib/docs/glossary";

// A glossary term where a page first uses it: a link to its entry, and its definition on hover or focus. Escape hides
// the definition; moving the pointer onto it keeps it open (WCAG 1.4.13).
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const entry = findGlossaryEntry(id);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  if (!entry) throw new Error(`No glossary entry "${id}" in lib/docs/glossary.ts.`);

  return (
    <span className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        aria-describedby={tooltipId}
        className="underline decoration-dotted decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
        href={`/docs/tools/glossary#${entry.id}`}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {children}
      </Link>
      <span
        className="absolute left-0 top-full z-30 w-72 max-w-[80vw] rounded-md border border-[var(--border-strong)] bg-[var(--card)] p-3 text-sm font-normal leading-6 text-[var(--foreground)] shadow-lg"
        hidden={!open}
        id={tooltipId}
        role="tooltip"
      >
        <span className="block font-semibold">{entry.term}</span>
        {entry.definition}
      </span>
    </span>
  );
}

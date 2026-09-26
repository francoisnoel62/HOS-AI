import type { ReactNode } from "react";

import { isPending, type LegalValue, pendingLegalFields } from "@/lib/legal";

/** A legal fact, or a highlighted placeholder while the publisher has not supplied it. */
export function LegalText({ value }: { value: LegalValue }) {
  if (!isPending(value)) return <>{value}</>;
  return <mark className="rounded-sm bg-[var(--warning-soft)] px-1 font-mono text-[0.85em] text-[var(--warning)]">[To complete: {value.pending}]</mark>;
}

export function LegalDocument({ eyebrow, title, description, updated, contents, children }: { eyebrow: string; title: string; description: ReactNode; updated: string; contents: Array<{ id: string; title: string }>; children: ReactNode }) {
  const open = pendingLegalFields().length;
  return (
    <>
      <section className="mx-auto max-w-3xl px-5 pb-8 pt-16 sm:pt-24 lg:px-8">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.065em] sm:text-5xl">{title}</h1>
        <p className="mt-6 text-base leading-7 text-[var(--muted-foreground)]">{description}</p>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Last updated <time dateTime={updated}>{updated}</time></p>
        {open ? <div className="mt-6 border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--muted-foreground)]" role="note"><p className="font-semibold text-[var(--foreground)]">Incomplete draft.</p><p className="mt-1">{open === 1 ? "One publisher detail is" : `${open} publisher details are`} still to be completed across the legal pages. They are marked “To complete”.</p></div> : null}
        <nav aria-label="On this page" className="mt-8 border-y border-[var(--border)] py-4">
          <ol className="grid gap-1 text-sm sm:grid-cols-2">{contents.map((item) => <li key={item.id}><a className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]" href={`#${item.id}`}>{item.title}</a></li>)}</ol>
        </nav>
      </section>
      <article className="mx-auto max-w-3xl space-y-10 px-5 pb-20 text-sm leading-7 text-[var(--muted-foreground)] lg:px-8">{children}</article>
    </>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-20 space-y-3" id={id}>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      {children}
    </section>
  );
}

/** Label–value rows, e.g. the publisher's identity. Rows whose value is `null` do not apply and are left out. */
export function LegalFacts({ rows }: { rows: Array<[string, LegalValue | ReactNode | null]> }) {
  return (
    <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {rows.filter(([, value]) => value !== null).map(([label, value]) => (
        <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]" key={label}>
          <dt className="font-medium text-[var(--foreground)]">{label}</dt>
          <dd>{isLegalValue(value) ? <LegalText value={value} /> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function isLegalValue(value: unknown): value is LegalValue {
  return typeof value === "string" || (typeof value === "object" && value !== null && "pending" in value);
}

export function LegalTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div aria-label={caption} className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="border-b border-[var(--border-strong)]">{head.map((cell) => <th className="py-2 pr-4 font-medium text-[var(--foreground)]" key={cell} scope="col">{cell}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr className="border-b border-[var(--border)] align-top" key={index}>{row.map((cell, cellIndex) => <td className="py-2 pr-4" key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export const legalLinkClass = "text-[var(--accent-strong)] underline";

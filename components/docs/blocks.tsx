import { CircleCheck, CircleHelp, Info, Lightbulb, LifeBuoy, PencilLine, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/content/status-badge";
import type { DocumentStatus } from "@/lib/content/site-copy";
import { slugify } from "@/lib/docs/markdown";
import { cn } from "@/lib/utils";

// The blocks every page of the tools documentation is built from (docs/plans/PLAN-SDK-DOC.md, §3 and §7). Each one is
// available in MDX without an import, through mdx-components.tsx.

const body = "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

export function InShort({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 border-l-2 border-[var(--accent)] pl-5">
      <p className="eyebrow">In short</p>
      <div className={cn("mt-2 text-lg leading-8 [&_p]:mt-2", body)}>{children}</div>
    </div>
  );
}

// Who the page is for, how long it takes and what it needs, before anything else.
export function FactSheet({
  audience,
  time,
  needs,
  status = "Draft",
}: {
  audience: string;
  time: string;
  needs?: string[];
  status?: DocumentStatus;
}) {
  const items: Array<[string, ReactNode]> = [
    ["For", audience],
    ["Time", time],
    ["You need", needs?.length ? needs.join(" · ") : "Nothing installed"],
    ["Status", <StatusBadge key="status" status={status} />],
  ];
  return (
    <dl className="my-8 grid gap-px overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
      {items.map(([term, detail]) => (
        <div className="bg-[var(--card)] p-4" key={term}>
          <dt className="eyebrow">{term}</dt>
          <dd className="mt-2 text-sm leading-6">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

const callouts = {
  note: { icon: Info, title: "Note", className: "border-[var(--accent)] bg-[var(--accent-soft)]", iconClass: "text-[var(--accent-strong)]" },
  tip: { icon: Lightbulb, title: "Tip", className: "border-[var(--success)] bg-[var(--success-soft)]", iconClass: "text-[var(--success)]" },
  warning: {
    icon: TriangleAlert,
    title: "Warning",
    className: "border-[var(--warning)] bg-[var(--warning-soft)]",
    iconClass: "text-[var(--warning)]",
  },
  why: { icon: CircleHelp, title: "Why?", className: "border-[var(--border-strong)] bg-[var(--muted)]", iconClass: "text-[var(--muted-foreground)]" },
};

export function Callout({ type = "note", title, children }: { type?: keyof typeof callouts; title?: string; children: ReactNode }) {
  const style = callouts[type];
  const Icon = style.icon;
  return (
    <div className={cn("my-6 rounded-md border-l-2 p-4", style.className)} role="note">
      <p className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className={style.iconClass} size={16} />
        {title ?? style.title}
      </p>
      <div className={cn("mt-2 text-sm leading-6 [&_p]:mt-2 [&_ul]:mt-2", body)}>{children}</div>
    </div>
  );
}

// Numbered steps. Each title is a level-3 heading, listed under "On this page"; keep <Step title="…"> on one line, as
// the list is read from the source.
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="docs-steps my-8">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  const id = slugify(title);
  return (
    <li className="docs-step">
      <h3 className="scroll-mt-24 text-lg font-semibold leading-8 tracking-[-0.02em]" id={id}>
        {title}
      </h3>
      <div className={cn("mt-3", body)}>{children}</div>
    </li>
  );
}

export function Checkpoint({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-md border border-[var(--success)] bg-[var(--success-soft)] p-4" role="note">
      <p className="flex items-center gap-2 font-semibold">
        <CircleCheck aria-hidden="true" className="text-[var(--success)]" size={16} />
        Check it worked
      </p>
      <div className={cn("mt-2 text-sm leading-6 [&_p]:mt-2", body)}>{children}</div>
    </div>
  );
}

// The failures a reader is most likely to meet on the page, each linked to its troubleshooting entry.
export function IfItFails({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-md border border-[var(--border-strong)] p-4" role="note">
      <p className="flex items-center gap-2 font-semibold">
        <LifeBuoy aria-hidden="true" className="text-[var(--danger)]" size={16} />
        If it fails
      </p>
      <div className={cn("mt-2 text-sm leading-6 [&_p]:mt-2", body)}>{children}</div>
    </div>
  );
}

function Disclosure({ summary, children, className }: { summary: string; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group my-6 rounded-md border border-[var(--border)]", className)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium marker:text-[var(--muted-foreground)]">{summary}</summary>
      <div className={cn("border-t border-[var(--border)] px-4 py-3 text-sm leading-6 [&_p]:mt-2", body)}>{children}</div>
    </details>
  );
}

// For developers who want the normative reason: folded, so the main text stays readable for everyone.
export function TechnicalDetail({ title = "Technical detail", children }: { title?: string; children: ReactNode }) {
  return (
    <Disclosure className="bg-[var(--card)]" summary={title}>
      {children}
    </Disclosure>
  );
}

// The same idea without jargon, for readers who do not write code.
export function PlainLanguage({ title = "In plain language", children }: { title?: string; children: ReactNode }) {
  return (
    <Disclosure className="bg-[var(--accent-soft)]" summary={title}>
      {children}
    </Disclosure>
  );
}

// Placeholder of a page that is not written yet: what it will cover, and where to look meanwhile.
export function PageInProgress({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-md border border-dashed border-[var(--warning)] bg-[var(--warning-soft)] p-5">
      <p className="flex items-center gap-2 font-semibold">
        <PencilLine aria-hidden="true" className="text-[var(--warning)]" size={16} />
        This page is being written.
      </p>
      <div className={cn("mt-2 text-sm leading-6 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2", body)}>{children}</div>
    </div>
  );
}

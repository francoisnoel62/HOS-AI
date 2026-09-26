import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ruleHref } from "@/lib/docs/tools";

// What the hos command prints, as it prints it: ✓ and ✗ in colour, the level of each message, and every rule id linked
// to its explanation. Written in MDX as a fenced block with the language "output".

const token = /(?<mark>[✓✗▲▼])|(?<=^\s+)(?<level>error|warning|note)(?=\s)|(?<rule>\brule )(?<id>[a-z]+\/[a-z0-9-]+)/g;

const markClass: Record<string, string> = {
  "✓": "text-[var(--code-success)]",
  "✗": "text-[var(--code-danger)]",
  "▲": "text-[var(--code-warning)]",
  "▼": "text-[var(--code-success)]",
};

const levelClass: Record<string, string> = {
  error: "text-[var(--code-danger)]",
  warning: "text-[var(--code-warning)]",
  note: "text-[var(--code-muted)]",
};

export function renderOutputLine(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(token)) {
    const { mark, level, rule, id } = match.groups!;
    parts.push(line.slice(last, match.index));
    if (mark)
      parts.push(
        <span className={markClass[mark]} key={match.index}>
          {mark}
        </span>,
      );
    if (level)
      parts.push(
        <span className={`font-semibold ${levelClass[level]}`} key={match.index}>
          {level}
        </span>,
      );
    if (rule && id) {
      parts.push(
        rule,
        <Link className="text-[var(--code-link)] underline underline-offset-2" href={ruleHref(id)} key={match.index}>
          {id}
        </Link>,
      );
    }
    last = match.index + match[0].length;
  }
  parts.push(line.slice(last));
  return parts.filter((part) => part !== "");
}

export function TerminalOutput({ children, label = "Output" }: { children: string; label?: string }) {
  const lines = children.replace(/\s+$/, "").split(/\r?\n/);
  return (
    <div className="my-5 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--code)] text-[var(--code-foreground)]">
      <div className="border-b border-white/10 px-3 py-2">
        <Badge>{label}</Badge>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-sm" tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <Fragment key={index}>
              {renderOutputLine(line)}
              {index < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

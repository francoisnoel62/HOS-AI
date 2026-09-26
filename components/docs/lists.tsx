import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { glossary } from "@/lib/docs/glossary";
import { findToolsPage } from "@/lib/docs/tools";

// Where each reader starts, by what they want to do (docs/plans/PLAN-SDK-DOC.md, §1).
const goals = [
  { goal: "understand what the HOS tools do", href: "/docs/tools/concepts" },
  { goal: "check that my events are valid", href: "/docs/tools/guides/validate" },
  { goal: "test my system that receives HOS events", href: "/docs/tools/guides/test-a-consumer" },
  { goal: "prove my system publishes correctly", href: "/docs/tools/guides/check-a-producer" },
  { goal: "sign and publish my manifest", href: "/docs/tools/guides/sign-and-publish" },
  { goal: "run the checks in CI", href: "/docs/tools/guides/ci" },
  { goal: "build an adapter in TypeScript", href: "/docs/tools/guides/build-an-adapter" },
  { goal: "read a report someone sent me", href: "/docs/tools/read-a-report" },
  { goal: "get unstuck", href: "/docs/tools/troubleshooting" },
];

export function IWantTo() {
  return (
    <nav aria-label="Start by what you want to do" className="my-8">
      <p className="eyebrow">I want to…</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {goals.map(({ goal, href }) => (
          <li key={href}>
            <Link
              className="group flex min-h-14 items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium transition-colors hover:border-[var(--accent)]"
              href={href}
            >
              <span>
                {goal.charAt(0).toUpperCase() + goal.slice(1)}
                {findToolsPage(href)?.written ? null : (
                  <span className="mt-0.5 block text-xs font-normal text-[var(--muted-foreground)]">Being written</span>
                )}
              </span>
              <ArrowRight aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)] group-hover:text-[var(--accent)]" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function GlossaryList() {
  return (
    <dl className="my-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {glossary.map((entry) => (
        <div className="scroll-mt-24 py-5" id={entry.id} key={entry.id}>
          <dt className="font-semibold">{entry.term}</dt>
          <dd className="mt-2 leading-7 text-[var(--muted-foreground)]">{entry.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

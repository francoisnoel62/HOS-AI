import Link from "next/link";

import { scenarioDemos } from "@/lib/content/scenarios";
import { type ConformanceScenarioId, conformanceScenarios } from "@/lib/hos/conformance";
import { cn } from "@/lib/utils";

// Switches between the conformance scenarios, each a page of its own.
export function ScenarioNav({ current }: { current: ConformanceScenarioId }) {
  return (
    <nav aria-label="Conformance scenarios" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {conformanceScenarios.map((id, index) => {
          const demo = scenarioDemos[id];
          const active = id === current;
          return (
            <li key={id}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]",
                )}
                href={demo.href}
              >
                <span className="font-mono text-xs">{index + 1}</span>
                {demo.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

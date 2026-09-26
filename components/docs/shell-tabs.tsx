"use client";

import { chooseShell, type Shell, shells } from "@/lib/docs/os-choice";
import { cn } from "@/lib/utils";

export const tabId = (baseId: string, shell: Shell) => `${baseId}-tab-${shell}`;
export const panelId = (baseId: string, shell: Shell) => `${baseId}-panel-${shell}`;

// The shell tabs above a command or a block of instructions. Choosing one switches every block of the page, so the
// reader chooses once.
export function ShellTabs({ baseId, current, tone = "code" }: { baseId: string; current: Shell; tone?: "code" | "page" }) {
  function move(from: number, direction: 1 | -1) {
    const next = shells[(from + direction + shells.length) % shells.length].id;
    chooseShell(next);
    document.getElementById(tabId(baseId, next))?.focus();
  }

  return (
    <div aria-label="Shell" className="flex min-w-0 flex-wrap gap-1" role="tablist">
      {shells.map((shell, index) => {
        const selected = shell.id === current;
        return (
          <button
            aria-controls={panelId(baseId, shell.id)}
            aria-selected={selected}
            className={cn(
              "rounded px-2 py-1 font-mono text-[0.7rem] transition-colors",
              tone === "code"
                ? selected
                  ? "bg-white/15 text-[var(--code-foreground)]"
                  : "text-[var(--code-muted)] hover:text-[var(--code-foreground)]"
                : selected
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
            id={tabId(baseId, shell.id)}
            key={shell.id}
            onClick={() => chooseShell(shell.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                move(index, 1);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, -1);
              }
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {shell.label}
          </button>
        );
      })}
    </div>
  );
}

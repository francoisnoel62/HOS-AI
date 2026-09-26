"use client";

import { createContext, type ReactNode, useContext, useId } from "react";

import { panelId, ShellTabs, tabId } from "@/components/docs/shell-tabs";
import { type Shell, useShell } from "@/lib/docs/os-choice";

const TabsContext = createContext<string | null>(null);

// Instructions that differ by shell, in prose as well as in commands:
//   <OsTabs>
//   <Os name="powershell">…</Os>
//   <Os name="cmd">…</Os>
//   <Os name="bash">…</Os>
//   </OsTabs>
// The choice is the same as for the commands of the page.
export function OsTabs({ children }: { children: ReactNode }) {
  const baseId = useId();
  const shell = useShell();
  return (
    <div className="my-6 rounded-md border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <ShellTabs baseId={baseId} current={shell} tone="page" />
      </div>
      <TabsContext.Provider value={baseId}>{children}</TabsContext.Provider>
    </div>
  );
}

export function Os({ name, children }: { name: Shell; children: ReactNode }) {
  const baseId = useContext(TabsContext);
  const shell = useShell();
  if (!baseId) throw new Error("<Os> belongs inside <OsTabs>.");
  return (
    <div
      aria-labelledby={tabId(baseId, name)}
      className="px-4 pb-4 [&>*:first-child]:mt-4"
      hidden={name !== shell}
      id={panelId(baseId, name)}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

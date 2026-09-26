"use client";

import { type ReactNode, useId } from "react";

import { CopyButton } from "@/components/docs/copy-button";
import { panelId, ShellTabs, tabId } from "@/components/docs/shell-tabs";
import { Badge } from "@/components/ui/badge";
import { useShell } from "@/lib/docs/os-choice";

type Variants = { powershell?: string; cmd?: string; bash?: string };

const trim = (text: string) => text.replace(/^\n+|\s+$/g, "");

// A command to type, with a copy button. Written once when it is the same everywhere:
//   <Command>npx @hos-ai/cli --version</Command>
// or once per shell when it differs, and the tabs follow the reader's shell:
//   <Command powershell="curl.exe -O …" cmd="curl -O …" bash="curl -O …" />
export function Command({ children, label = "Terminal", ...variants }: Variants & { children?: string; label?: string }) {
  const baseId = useId();
  const shell = useShell();
  const perShell = Boolean(variants.powershell || variants.cmd || variants.bash);

  if (!perShell) {
    const code = trim(children ?? "");
    return (
      <Frame header={<Badge variant="active">{label}</Badge>} text={code}>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-sm" tabIndex={0}>
          <code>{code}</code>
        </pre>
      </Frame>
    );
  }

  const codeFor = (id: keyof Variants) => trim(variants[id] ?? children ?? "");
  return (
    <Frame header={<ShellTabs baseId={baseId} current={shell} />} text={codeFor(shell)}>
      {(["powershell", "cmd", "bash"] as const).map((id) => (
        <pre
          aria-labelledby={tabId(baseId, id)}
          className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-sm"
          hidden={id !== shell}
          id={panelId(baseId, id)}
          key={id}
          role="tabpanel"
          tabIndex={0}
        >
          <code>{codeFor(id)}</code>
        </pre>
      ))}
    </Frame>
  );
}

function Frame({ header, text, children }: { header: ReactNode; text: string; children: ReactNode }) {
  return (
    <div className="my-5 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--code)] text-[var(--code-foreground)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        {header}
        <CopyButton label="Copy command" text={text} />
      </div>
      {children}
    </div>
  );
}

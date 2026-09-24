import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function CodePanel({ label = "HOS event", code }: { label?: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--code)] text-[var(--code-foreground)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Badge variant="active">{label}</Badge>
        <Copy aria-hidden="true" size={14} />
      </div>
      {/* Focusable so keyboard users can scroll long lines. */}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-sm" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

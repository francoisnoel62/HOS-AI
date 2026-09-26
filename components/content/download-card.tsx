import { Download } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A published file to download, with what it holds.
export function DownloadCard({ href, label, children, className }: { href: string; label: string; children: ReactNode; className?: string }) {
  return (
    <a className={cn("group", className)} download href={href}>
      <Card className="flex h-full items-start gap-3 p-4 transition-colors group-hover:border-[var(--border-strong)]">
        <Download aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent)]" size={16} />
        <span>
          <span className="block font-mono text-sm">{label}</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">{children}</span>
        </span>
      </Card>
    </a>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Copies a command. The result is announced, and a refusal of the clipboard says so instead of failing silently.
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button
        aria-label={label}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-[var(--code-muted)] transition-colors hover:border-white/20 hover:text-[var(--code-foreground)]",
          className,
        )}
        onClick={copy}
        type="button"
      >
        {state === "copied" ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Copied" : state === "failed" ? "Copying failed: select the text and copy it" : ""}
      </span>
    </>
  );
}

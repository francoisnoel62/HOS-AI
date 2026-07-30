import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em]",
  {
    variants: {
      variant: {
        default: "border-[var(--border-strong)] bg-[var(--muted)] text-[var(--muted-foreground)]",
        active: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
        success: "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

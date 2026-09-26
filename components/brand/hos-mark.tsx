import { cn } from "@/lib/utils";

export function HOSMark({ className, title = "HOS AI" }: { className?: string; title?: string }) {
  return (
    <svg aria-label={title} className={cn("h-8 w-8", className)} fill="none" role="img" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <path d="M6 10h8l5 8h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M6 26h8l5-8h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="6" cy="10" fill="currentColor" r="3" />
      <circle cx="6" cy="26" fill="currentColor" r="3" />
      <circle cx="30" cy="18" fill="currentColor" r="3" />
      <circle cx="19" cy="18" fill="var(--accent)" r="3" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-[var(--foreground)]", className)}>
      <HOSMark />
      <span className="text-base font-semibold tracking-[-0.06em]">HOS AI</span>
    </div>
  );
}

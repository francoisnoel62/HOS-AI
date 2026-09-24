import Link from "next/link";

export function DraftNotice() {
  return (
    <div className="border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-5 text-sm leading-7 text-[var(--muted-foreground)]">
      <p className="font-semibold text-[var(--foreground)]">Draft for review.</p>
      <p className="mt-1">
        Names and fields may change before 0.1 is final. The specification is intended for publication under CC BY 4.0; schemas are Apache-2.0. Every example is synthetic. Comments and counter-proposals are welcome through the{" "}
        <Link className="text-[var(--accent-strong)] underline" href="/participate/technical-contributor">
          technical contributor path
        </Link>
        .
      </p>
    </div>
  );
}

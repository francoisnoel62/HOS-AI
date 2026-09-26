"use client";

import { ChevronDown, PencilLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { DocsSearch } from "@/components/docs/docs-search";
import { toolsSections } from "@/lib/docs/tools";
import { cn } from "@/lib/utils";

function PageLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {toolsSections.map((section) => (
        <div key={section.title}>
          <p className="eyebrow">{section.title}</p>
          <ul className="mt-2 space-y-0.5 border-l border-[var(--border)]">
            {section.pages.map((item) => {
              const current = item.href === pathname;
              return (
                <li key={item.href}>
                  <Link
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "-ml-px flex items-center gap-1.5 border-l py-1.5 pl-3 text-sm transition-colors",
                      current
                        ? "border-[var(--accent)] font-medium text-[var(--foreground)]"
                        : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]",
                    )}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    {item.navTitle}
                    {item.written ? null : (
                      <>
                        <PencilLine aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)]" size={12} />
                        <span className="sr-only">, being written</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p aria-hidden="true" className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <PencilLine size={12} /> Being written
      </p>
    </div>
  );
}

// "/" moves to the search box that is on screen, as on most documentation sites.
function useSearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const visible = [...document.querySelectorAll<HTMLInputElement>("[data-docs-search]")].find((input) => input.offsetParent !== null);
      if (!visible) return;
      event.preventDefault();
      visible.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

// The sidebar of the tools documentation: fixed beside the page on large screens, folded above it on small ones.
export function DocsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const close = () => setOpen(false);
  useSearchShortcut();

  return (
    <>
      <div className="border-b border-[var(--border)] py-4 lg:hidden">
        <DocsSearch onNavigate={close} />
        <button
          aria-controls={menuId}
          aria-expanded={open}
          className="mt-3 flex w-full items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium"
          onClick={() => setOpen(!open)}
          type="button"
        >
          Tools documentation menu
          <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} size={16} />
        </button>
        <nav aria-label="Tools documentation" className="mt-4" hidden={!open} id={menuId}>
          <PageLinks onNavigate={close} pathname={pathname} />
        </nav>
      </div>
      <div className="hidden lg:sticky lg:top-16 lg:block lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:py-10 lg:pr-2">
        <DocsSearch />
        <nav aria-label="Tools documentation" className="mt-8">
          <PageLinks pathname={pathname} />
        </nav>
      </div>
    </>
  );
}

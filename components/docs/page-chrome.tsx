import { ArrowLeft, ArrowRight, ChevronRight, MessageSquareWarning } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/content/status-badge";
import type { Heading } from "@/lib/docs/markdown";
import { neighboursOf, sectionOf, type ToolsPage } from "@/lib/docs/tools";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function PageHeader({ page }: { page: ToolsPage }) {
  const section = sectionOf(page);
  const trail = [{ href: "/docs", label: "Documentation" }, ...(page.href === "/docs/tools" ? [] : [{ href: "/docs/tools", label: "Tools" }])];
  return (
    <header>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted-foreground)]">
          {trail.map((crumb) => (
            <li className="flex items-center gap-1" key={crumb.href}>
              <Link className="hover:text-[var(--foreground)]" href={crumb.href}>
                {crumb.label}
              </Link>
              <ChevronRight aria-hidden="true" size={12} />
            </li>
          ))}
          {section && page.href !== "/docs/tools" ? (
            <li className="flex items-center gap-1">
              {section.title}
              <ChevronRight aria-hidden="true" size={12} />
            </li>
          ) : null}
          <li aria-current="page" className="text-[var(--foreground)]">
            {page.navTitle}
          </li>
        </ol>
      </nav>
      <div className="mt-6">
        <StatusBadge status={page.status} />
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{page.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{page.description}</p>
    </header>
  );
}

function HeadingLinks({ headings }: { headings: Heading[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {headings.map((heading) => (
        <li className={cn(heading.depth === 3 && "pl-3")} key={heading.id}>
          <a className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" href={`#${heading.id}`}>
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

// Beside the page on wide screens; folded at the top of the page on the others.
export function OnThisPage({ headings, placement }: { headings: Heading[]; placement: "aside" | "top" }) {
  if (headings.length < 2) return null;
  if (placement === "top") {
    return (
      <details className="mt-8 rounded-md border border-[var(--border)] xl:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">On this page</summary>
        <nav aria-label="On this page" className="border-t border-[var(--border)] px-4 py-3">
          <HeadingLinks headings={headings} />
        </nav>
      </details>
    );
  }
  return (
    <nav aria-label="On this page" className="sticky top-16 hidden max-h-[calc(100vh-4rem)] overflow-y-auto py-10 xl:block">
      <p className="eyebrow">On this page</p>
      <div className="mt-3">
        <HeadingLinks headings={headings} />
      </div>
    </nav>
  );
}

// A GitHub issue about this page, with its title and address filled in.
export function reportHref(page: ToolsPage) {
  const params = new URLSearchParams({
    labels: "documentation",
    title: `Docs: ${page.title}`,
    body: [
      `Page: ${siteConfig.url}${page.href}`,
      "",
      "What is wrong, missing or unclear:",
      "",
      "",
      "Use synthetic data only: never real guest data, credentials, API keys or private keys.",
    ].join("\n"),
  });
  return `${siteConfig.githubUrl}/issues/new?${params}`;
}

export function PageFooter({ page }: { page: ToolsPage }) {
  const { previous, next } = neighboursOf(page);
  return (
    <footer className="mt-16 border-t border-[var(--border)] pt-8">
      <p className="text-sm text-[var(--muted-foreground)]">
        <a
          className="inline-flex items-center gap-2 underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--foreground)] hover:decoration-[var(--accent)]"
          href={reportHref(page)}
          rel="noreferrer"
          target="_blank"
        >
          <MessageSquareWarning aria-hidden="true" size={15} />
          Report a problem with this page
        </a>
      </p>
      {previous || next ? (
        <nav aria-label="Previous and next pages" className="mt-8 grid gap-3 sm:grid-cols-2">
          {previous ? (
            <Link
              className="group rounded-md border border-[var(--border)] p-4 transition-colors hover:border-[var(--accent)]"
              href={previous.href}
              rel="prev"
            >
              <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                <ArrowLeft aria-hidden="true" size={13} /> Previous
              </span>
              <span className="mt-1 block font-medium">{previous.navTitle}</span>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {next ? (
            <Link
              className="group rounded-md border border-[var(--border)] p-4 text-right transition-colors hover:border-[var(--accent)]"
              href={next.href}
              rel="next"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-[var(--muted-foreground)]">
                Next <ArrowRight aria-hidden="true" size={13} />
              </span>
              <span className="mt-1 block font-medium">{next.navTitle}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </footer>
  );
}

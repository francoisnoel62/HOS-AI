import type { Metadata } from "next";
import { ArrowUpRight, GitFork } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { StatusBadge } from "@/components/content/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { documentationItems } from "@/lib/content/site-copy";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description: "HOS Core, event model, conformance scenario and mapping status as they are actually published.",
};

export default function DocumentationPage() {
  return (
    <>
      <PageHero
        eyebrow="Documentation"
        title="Inspect the contract, its proof and its current limits."
        description="Documentation is useful from the first public draft. Each item states exactly where it is in the work; unavailable material is not hidden behind a false link."
        badge="Core 0.1 · Draft"
      />
      <section className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="flex flex-wrap gap-3">
          <Link href="/docs/core">
            <Button>Read HOS Core 0.1</Button>
          </Link>
          <Link href="/demo">
            <Button variant="secondary">Replay the arrival scenario</Button>
          </Link>
        </div>
      </section>
      <SectionFrame eyebrow="Published work" title="Status is part of the documentation.">
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {documentationItems.map((item) => (
            <article className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center" key={item.title}>
              <div>
                <h2 className="font-medium">
                  {item.href ? (
                    <Link
                      className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
                      href={item.href}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{item.description}</p>
              </div>
              <StatusBadge status={item.status} />
            </article>
          ))}
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Contribution surface" title="Contribute through the repository, not a closed comment box.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <GitFork aria-hidden="true" className="text-[var(--accent)]" size={22} />
            <h2 className="mt-6 text-xl font-semibold">Open work</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Propose a HIP, mapping, test, schema or documentation improvement through the shared project history.
            </p>
            <a className="mt-5 inline-block" href={siteConfig.githubUrl} rel="noreferrer" target="_blank">
              <Button>
                Contribute on GitHub <ArrowUpRight aria-hidden="true" size={15} />
              </Button>
            </a>
          </Card>
          <Card className="p-6">
            <p className="eyebrow">Changelog</p>
            <h2 className="mt-4 text-xl font-semibold">Changes only when something has changed.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              No artificial news cadence. Releases and published decisions are the changelog.
            </p>
            <a className="mt-5 inline-block" href="/changelog">
              <Button variant="secondary">View changelog</Button>
            </a>
          </Card>
        </div>
      </SectionFrame>
    </>
  );
}

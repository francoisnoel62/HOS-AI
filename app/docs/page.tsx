import type { Metadata } from "next";
import { ArrowUpRight, GitFork } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
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

// The two packages, with the first commands of their npm pages.
const tools = [
  {
    name: "@hos-ai/cli",
    description:
      "The hos command validates HOS files, replays event streams, runs the conformance scenarios through an implementation in any language, checks what a producer publishes and signs producer manifests. It needs Node.js 22 or later, and works offline.",
    label: "Terminal",
    code: [
      "npx @hos-ai/cli --version",
      "npx @hos-ai/cli validate stay.expected.json",
      'npx @hos-ai/cli conformance run --all --level normative --impl "python3 impl.py"',
    ].join("\n"),
    link: "Five-minute start",
  },
  {
    name: "@hos-ai/sdk",
    description:
      "Types, validation, the HOS Events processing rules, facts with stable ids and signed manifests, for TypeScript in Node or in a browser. The arrival-readiness reference projection comes with it, marked non-normative.",
    label: "TypeScript",
    code: [
      "npm install @hos-ai/sdk",
      "",
      'import { validate } from "@hos-ai/sdk";',
      "",
      "const { valid, errors } = validate(event);",
      "if (!valid) console.log(errors);",
    ].join("\n"),
    link: "Examples",
  },
];

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
      <SectionFrame
        description="Two npm packages carry the HOS 0.1 schemas and conformance scenarios. They are alphas, as HOS 0.1 is a draft. Passing the scenarios is a self-check, not a certification: no HOS certification exists yet."
        eyebrow="Tools"
        id="tools"
        title="Check your work from the command line."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {tools.map((tool) => (
            <Card className="flex min-w-0 flex-col p-6" key={tool.name}>
              <h3 className="font-mono text-lg font-semibold">{tool.name}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{tool.description}</p>
              <div className="mt-5 min-w-0 flex-1">
                <CodePanel code={tool.code} label={tool.label} />
              </div>
              <a className="mt-5 inline-block" href={`https://www.npmjs.com/package/${tool.name}`} rel="noreferrer" target="_blank">
                <Button variant="secondary">
                  {tool.link} <ArrowUpRight aria-hidden="true" size={15} />
                </Button>
              </a>
            </Card>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          An implementation in another language gets its verdict through the{" "}
          <a
            className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
            href="/spec/0.1/conformance/PROTOCOL.md"
          >
            conformance protocol
          </a>
          . Stuck, or found a problem?{" "}
          <a
            className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
            href={`${siteConfig.githubUrl}/issues/new/choose`}
            rel="noreferrer"
            target="_blank"
          >
            Open an issue
          </a>{" "}
          with synthetic data only.
        </p>
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

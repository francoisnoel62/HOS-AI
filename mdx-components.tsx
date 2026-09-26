import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { type ComponentPropsWithoutRef, isValidElement, type ReactNode } from "react";

import { StatusBadge } from "@/components/content/status-badge";
import { DownloadCard } from "@/components/content/download-card";
import {
  Callout,
  Checkpoint,
  FactSheet,
  IfItFails,
  InShort,
  PageInProgress,
  PlainLanguage,
  Step,
  Steps,
  TechnicalDetail,
} from "@/components/docs/blocks";
import { Command } from "@/components/docs/command";
import { GlossaryList, IWantTo } from "@/components/docs/lists";
import { Os, OsTabs } from "@/components/docs/os-tabs";
import { Term } from "@/components/docs/term";
import { TerminalOutput } from "@/components/docs/terminal-output";
import { CliVersion, NpxPrompt, SpecVersionOutput, VersionOutput, Versions } from "@/components/docs/versions";
import { CodePanel } from "@/components/content/code-panel";
import { slugify, textOf } from "@/lib/docs/markdown";

// How the MDX pages of /docs/tools render: Markdown elements in the site's style, and the documentation components,
// usable without an import. Headings get the ids that "On this page" links to (lib/docs/markdown.ts).

function heading(Tag: "h2" | "h3", className: string) {
  return function Heading({ children }: { children?: ReactNode }) {
    const id = slugify(textOf(children));
    return (
      <Tag className={`group scroll-mt-24 ${className}`} id={id}>
        {children}
        {/* A pointer shortcut only: "On this page" links every heading for keyboards and screen readers. */}
        <a aria-hidden="true" className="ml-2 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100" href={`#${id}`} tabIndex={-1}>
          #
        </a>
      </Tag>
    );
  };
}

const linkClass = "text-[var(--accent-strong)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]";

function Anchor({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link className={linkClass} href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a className={linkClass} href={href} rel="noreferrer" target="_blank" {...props}>
      {children}
    </a>
  );
}

const shellLabels: Record<string, string> = { sh: "Terminal", bash: "Terminal", shell: "Terminal", powershell: "PowerShell", cmd: "Command Prompt" };
const codeLabels: Record<string, string> = {
  mdx: "MDX",
  json: "JSON",
  jsonl: "JSON Lines",
  ts: "TypeScript",
  js: "JavaScript",
  python: "Python",
  yaml: "YAML",
  text: "Text",
};

// A fenced block: ```sh is a command to copy, ```output is what hos prints, anything else is a code panel.
function Pre({ children }: ComponentPropsWithoutRef<"pre">) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const language = code?.props.className?.replace(/^language-/, "") ?? "text";
  const text = textOf(code?.props.children).replace(/\r\n/g, "\n").replace(/\n$/, "");
  if (language === "output") return <TerminalOutput>{text}</TerminalOutput>;
  if (language in shellLabels) return <Command label={shellLabels[language]}>{text}</Command>;
  return (
    <div className="my-5">
      <CodePanel code={text} label={codeLabels[language] ?? language.toUpperCase()} />
    </div>
  );
}

const components: MDXComponents = {
  h2: heading("h2", "mt-14 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"),
  h3: heading("h3", "mt-10 text-lg font-semibold tracking-[-0.02em]"),
  p: (props) => <p className="mt-4 leading-7" {...props} />,
  a: Anchor,
  ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 marker:text-[var(--muted-foreground)]" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 marker:text-[var(--muted-foreground)]" {...props} />,
  blockquote: (props) => <blockquote className="mt-4 border-l-2 border-[var(--border-strong)] pl-4 text-[var(--muted-foreground)]" {...props} />,
  hr: () => <hr className="my-10 border-[var(--border)]" />,
  code: (props) => <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.85em]" {...props} />,
  pre: Pre,
  table: (props) => (
    <div className="mt-6 overflow-x-auto border border-[var(--border)]" role="region" aria-label="Table" tabIndex={0}>
      <table className="w-full text-left text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]" {...props} />,
  th: (props) => <th className="px-4 py-3 font-medium" {...props} />,
  td: (props) => <td className="border-t border-[var(--border)] px-4 py-3 align-top leading-6" {...props} />,
  Callout,
  Checkpoint,
  Command,
  DownloadCard: (props: ComponentPropsWithoutRef<typeof DownloadCard>) => <DownloadCard className="my-3 block" {...props} />,
  FactSheet,
  GlossaryList,
  IfItFails,
  InShort,
  IWantTo,
  Os,
  OsTabs,
  PageInProgress,
  PlainLanguage,
  StatusBadge,
  Step,
  Steps,
  TechnicalDetail,
  Term,
  TerminalOutput,
  CliVersion,
  NpxPrompt,
  SpecVersionOutput,
  VersionOutput,
  Versions,
};

export function useMDXComponents(): MDXComponents {
  return components;
}

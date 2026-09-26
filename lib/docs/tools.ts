import type { DocumentStatus } from "@/lib/content/site-copy";

// The pages of the tools documentation, in reading order. The sidebar, the breadcrumb, the previous and next links, the
// search index and the sitemap all read this list. Each page's text is content/docs/tools/<file>.mdx.
//
// A page stays out of search engines and the sitemap until it is written: merging to master publishes it, and a page
// that only announces its content should not be found on its own.

export type ToolsPage = {
  href: string;
  // Relative to content/docs/tools, without .mdx.
  file: string;
  title: string;
  navTitle: string;
  description: string;
  status: DocumentStatus;
  written: boolean;
};

export type ToolsSection = { title: string; pages: ToolsPage[] };

const page = (slug: string, fields: Omit<ToolsPage, "href" | "file" | "status" | "written"> & Partial<Pick<ToolsPage, "written">>): ToolsPage => ({
  href: slug ? `/docs/tools/${slug}` : "/docs/tools",
  file: slug || "index",
  status: "Draft",
  written: false,
  ...fields,
});

export const toolsSections: ToolsSection[] = [
  {
    title: "Start here",
    pages: [
      page("", {
        written: true,
        title: "The hos command and the SDK",
        navTitle: "Overview",
        description: "What @hos-ai/cli and @hos-ai/sdk do, which one you need, and what they do not do.",
      }),
      page("concepts", {
        written: true,
        title: "Concepts",
        navTitle: "Concepts",
        description:
          "Facts, producers and consumers, manifests, authority, the five dispositions and the other ideas the tools rely on, in plain language.",
      }),
      page("install", {
        written: true,
        title: "Install the tools",
        navTitle: "Install",
        description: "Install the hos command and the SDK on Windows, macOS or Linux, and check that they work.",
      }),
      page("quickstart", {
        written: true,
        title: "Quickstart",
        navTitle: "Quickstart",
        description: "Validate an example, read an error and replay a scenario in ten minutes, without writing any code.",
      }),
      page("read-a-report", {
        written: true,
        title: "Read a HOS report",
        navTitle: "Read a report",
        description: "What a report from the tools says, and what it does not prove. For readers who do not write code.",
      }),
    ],
  },
  {
    title: "Guides",
    pages: [
      page("guides/validate", {
        title: "Validate events, manifests and streams",
        navTitle: "Validate files",
        description: "Check HOS documents and event streams against the schemas and the HOS Events rules, and read what the command reports.",
      }),
      page("guides/replay", {
        title: "Replay a stream",
        navTitle: "Replay a stream",
        description: "See what a consumer does with each fact of a stream, delivery by delivery.",
      }),
      page("guides/test-a-consumer", {
        title: "Test a system that receives HOS facts",
        navTitle: "Test a consumer",
        description: "Run the conformance scenarios through your own program, in any language.",
      }),
      page("guides/check-a-producer", {
        title: "Check what a producer publishes",
        navTitle: "Check a producer",
        description: "Check a producer's manifest, the facts it records and what it sends again when it restarts.",
      }),
      page("guides/sign-and-publish", {
        title: "Sign and publish a producer manifest",
        navTitle: "Sign and publish",
        description: "Create a key, sign your manifest, publish it under /.well-known/hos/ and keep it valid.",
      }),
      page("guides/ci", {
        title: "Run the checks in CI",
        navTitle: "Use in CI",
        description: "Exit codes, JSON and JUnit output, and a complete GitHub Actions workflow.",
      }),
      page("guides/build-an-adapter", {
        title: "Build an adapter with the SDK",
        navTitle: "Build an adapter",
        description: "Turn a system's data into HOS facts with stable ids, validate them and check them, in TypeScript.",
      }),
    ],
  },
  {
    title: "Reference",
    pages: [
      page("cli", {
        title: "hos command reference",
        navTitle: "CLI reference",
        description: "Every command and option of @hos-ai/cli, with its exit codes and output.",
      }),
      page("sdk", {
        title: "@hos-ai/sdk reference",
        navTitle: "SDK reference",
        description: "The entry points and functions of @hos-ai/sdk, for Node and the browser.",
      }),
      page("protocol", {
        title: "The conformance protocol",
        navTitle: "Conformance protocol",
        description: "hos-conformance/1: how hos talks to the program it tests, over standard input and output.",
      }),
      page("rules", {
        title: "Validation rules",
        navTitle: "Rules",
        description: "Each rule the tools report, what it means, an example that breaks it and how to fix it.",
      }),
      page("glossary", {
        title: "Glossary",
        navTitle: "Glossary",
        description: "The terms of the HOS tools documentation, in plain language.",
      }),
    ],
  },
  {
    title: "Help",
    pages: [
      page("troubleshooting", {
        title: "Troubleshooting",
        navTitle: "Troubleshooting",
        description: "Find your problem by symptom, by the exact message or by its code, and fix it step by step.",
      }),
      page("help", {
        title: "Get help",
        navTitle: "Get help",
        description: "What to check first, what to send, and where to ask.",
      }),
    ],
  },
];

export const toolsPages = toolsSections.flatMap((section) => section.pages);

// Pages outside the reading order: reachable by their link only.
export const toolsExtraPages: ToolsPage[] = [
  page("authoring", {
    title: "Writing these pages",
    navTitle: "Writing these pages",
    description: "The components of the tools documentation and the MDX that produces each one, for contributors.",
  }),
];

export const allToolsPages = [...toolsPages, ...toolsExtraPages];

export function findToolsPage(href: string) {
  return allToolsPages.find((item) => item.href === href);
}

export function sectionOf(item: ToolsPage) {
  return toolsSections.find((section) => section.pages.includes(item));
}

export function neighboursOf(item: ToolsPage) {
  const index = toolsPages.indexOf(item);
  if (index < 0) return { previous: undefined, next: undefined };
  return { previous: toolsPages[index - 1], next: toolsPages[index + 1] };
}

// A rule id such as events/minimal-data has the anchor #events-minimal-data on the rules page.
export const ruleHref = (rule: string) => `/docs/tools/rules#${rule.replaceAll("/", "-")}`;

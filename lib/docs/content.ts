import { readFileSync } from "node:fs";
import path from "node:path";

import { headingsOf, readMdx } from "@/lib/docs/markdown";
import type { SearchEntry } from "@/lib/docs/search";
import { toolsPages, type ToolsPage } from "@/lib/docs/tools";

// Server-side reads of the MDX sources, at build time: the headings of a page and the search index.

export const contentDirectory = path.join(process.cwd(), "content", "docs", "tools");

export const sourceOf = (item: ToolsPage) => readFileSync(path.join(contentDirectory, `${item.file}.mdx`), "utf8");

export const pageHeadings = (item: ToolsPage) => headingsOf(sourceOf(item));

// One entry per page, with its description and the text before its first heading, then one per section.
export function buildSearchIndex(): SearchEntry[] {
  return toolsPages.flatMap((item) => {
    const boost = item.href === "/docs/tools/troubleshooting" ? 1.5 : undefined;
    const sections = readMdx(sourceOf(item));
    const intro = sections[0] && !sections[0].heading ? sections.shift()!.text : "";
    return [
      { href: item.href, page: item.title, text: `${item.description} ${intro}`.trim(), boost },
      ...sections.map((section) => ({
        href: `${item.href}#${section.heading!.id}`,
        page: item.title,
        heading: section.heading!.text,
        text: section.text,
        boost,
      })),
    ];
  });
}

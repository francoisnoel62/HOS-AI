import { isValidElement, type ReactNode } from "react";

// Headings and plain text of the tools documentation, read from the MDX sources for the "On this page" list and the search
// index, and from the rendered headings for their ids. Both sides go through slugify on the same text, so an id computed
// from a source line matches the id of the heading it renders.

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The text of rendered children: a heading with inline code or a link reads as its words.
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

// Inline Markdown as the reader sees it: links, code and emphasis marks removed.
export function inlineText(markdown: string) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

export type Heading = { depth: 2 | 3; text: string; id: string };
export type SourceSection = { heading?: Heading; text: string };

const fence = /^\s*(```|~~~)/;
const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// Splits an MDX source into sections at its level-2 and level-3 headings. A <Step title="…"> is a level-3 heading, as it
// renders one. The text keeps the words of the prose, of the code blocks and of each component's title.
export function readMdx(source: string): SourceSection[] {
  const sections: SourceSection[] = [{ text: "" }];
  const current = () => sections[sections.length - 1];
  const push = (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) current().text += (current().text ? " " : "") + clean;
  };
  const open = (depth: 2 | 3, raw: string) => {
    const text = inlineText(raw);
    sections.push({ heading: { depth, text, id: slugify(text) }, text: "" });
  };

  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    if (fence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      push(line);
      continue;
    }
    if (/^(import|export)\s/.test(line)) continue;
    const heading = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      open(heading[1].length as 2 | 3, heading[2]);
      continue;
    }
    // A tag quoted in inline code is text, not a component.
    const parts = line.split(/(`[^`]*`)/);
    const markup = parts.filter((_, index) => index % 2 === 0).join(" ");
    for (const tag of markup.match(/<[A-Za-z][^>]*>/g) ?? []) {
      const title = attribute(tag, "title");
      if (/^<Step\b/.test(tag) && title) open(3, title);
      else if (title) push(title);
    }
    push(
      inlineText(
        parts
          .map((part, index) => (index % 2 === 0 ? part.replace(/<\/?[A-Za-z][^>]*>/g, " ") : part))
          .join("")
          .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
          .replace(/^\s*>\s?/, "")
          .replace(/\|/g, " ")
          .replace(/^\s*:?-{3,}:?(\s+:?-{3,}:?)*\s*$/, ""),
      ),
    );
  }
  return sections.filter((section, index) => index > 0 || section.text);
}

export const headingsOf = (source: string) => readMdx(source).flatMap((section) => (section.heading ? [section.heading] : []));

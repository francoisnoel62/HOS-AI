import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Command } from "@/components/docs/command";
import { Os, OsTabs } from "@/components/docs/os-tabs";
import { TerminalOutput } from "@/components/docs/terminal-output";
import { buildSearchIndex, contentDirectory, sourceOf } from "@/lib/docs/content";
import { glossary } from "@/lib/docs/glossary";
import { headingsOf, readMdx, slugify } from "@/lib/docs/markdown";
import { chooseShell } from "@/lib/docs/os-choice";
import { createSearch } from "@/lib/docs/search";
import { allToolsPages, findToolsPage, neighboursOf, ruleHref, toolsPages } from "@/lib/docs/tools";

const mdxFiles = (directory = contentDirectory): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? mdxFiles(path.join(directory, entry.name))
      : [
          path
            .relative(contentDirectory, path.join(directory, entry.name))
            .replaceAll("\\", "/")
            .replace(/\.mdx$/, ""),
        ],
  );

describe("tools documentation pages", () => {
  it("has one MDX file and one loader for each page of the list, and no file outside it", () => {
    const loaders = readFileSync(path.join(process.cwd(), "app/docs/tools/[[...slug]]/content.ts"), "utf8");
    const files = allToolsPages.map((item) => item.file);
    expect(new Set(files).size).toBe(files.length);
    expect(mdxFiles().sort()).toEqual([...files].sort());
    for (const file of files) expect(loaders).toContain(`"@/content/docs/tools/${file}.mdx"`);
  });

  it("gives every page a unique address under /docs/tools, and chains them in reading order", () => {
    const hrefs = allToolsPages.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href).toMatch(/^\/docs\/tools(\/[a-z-]+)*$/);
    expect(neighboursOf(toolsPages[0]).previous).toBeUndefined();
    expect(neighboursOf(toolsPages[0]).next).toBe(toolsPages[1]);
    expect(neighboursOf(toolsPages.at(-1)!).next).toBeUndefined();
    expect(neighboursOf(findToolsPage("/docs/tools/authoring")!)).toEqual({ previous: undefined, next: undefined });
  });

  it("gives the headings of each page unique ids, and keeps each step title on one line", () => {
    for (const item of allToolsPages) {
      const source = sourceOf(item);
      const ids = headingsOf(source).map((heading) => heading.id);
      expect(ids.every(Boolean), item.file).toBe(true);
      expect(new Set(ids).size, item.file).toBe(ids.length);
      const steps = source.split("\n").filter((line) => line.replace(/`[^`]*`/g, "").includes("<Step "));
      for (const line of steps) expect(line, item.file).toMatch(/^\s*<Step title="[^"]+">\s*$/);
    }
  });

  it("links only to pages that exist and to glossary terms that exist", () => {
    const hrefs = new Set(allToolsPages.map((item) => item.href));
    const terms = new Set(glossary.map((entry) => entry.id));
    for (const item of allToolsPages) {
      const source = sourceOf(item);
      for (const [, target] of source.matchAll(/\]\((\/docs\/tools[^)#\s]*)/g)) expect(hrefs, `${item.file} → ${target}`).toContain(target);
      for (const [, id] of source.matchAll(/<Term id="([^"]+)"/g)) expect(terms, `${item.file} → ${id}`).toContain(id);
    }
  });
});

describe("MDX sources", () => {
  it("splits a page at its headings and steps, with the ids the rendered headings get", () => {
    const sections = readMdx(
      [
        'import x from "y";',
        "Intro with a [link](/docs).",
        "## Validate `stay.expected.json`",
        "```sh",
        "hos validate stay.expected.json",
        "```",
        "<Steps>",
        '<Step title="Break it on purpose">',
        "- a **bold** item",
        "</Step>",
        "</Steps>",
        'Keep `<Step title="…">` on one line.',
        "### Déjà vu",
      ].join("\r\n"),
    );
    expect(sections.map((section) => section.heading)).toEqual([
      undefined,
      { depth: 2, text: "Validate stay.expected.json", id: "validate-stay-expected-json" },
      { depth: 3, text: "Break it on purpose", id: "break-it-on-purpose" },
      { depth: 3, text: "Déjà vu", id: "deja-vu" },
    ]);
    expect(sections[0].text).toBe("Intro with a link.");
    expect(sections[1].text).toBe("hos validate stay.expected.json");
    expect(sections[2].text).toBe('a bold item Keep <Step title="…"> on one line.');
  });

  it("does not read a heading inside a code block", () => {
    expect(headingsOf(["```md", "## Not a heading", "```", "## A heading"].join("\n"))).toEqual([{ depth: 2, text: "A heading", id: "a-heading" }]);
  });

  it("links a rule id to its anchor on the rules page", () => {
    expect(ruleHref("events/minimal-data")).toBe("/docs/tools/rules#events-minimal-data");
    expect(slugify("events/minimal-data")).toBe("events-minimal-data");
  });
});

describe("documentation search", () => {
  const search = createSearch([
    { href: "/a", page: "Sign and publish a producer manifest", text: "Create a key and sign your manifest." },
    {
      href: "/b#usage",
      page: "Troubleshooting",
      heading: "Usage errors",
      text: "name the implementation to test with --impl: hos needs the command that starts your program.",
      boost: 1.5,
    },
    { href: "/c", page: "Validate", text: "Validate events, manifests and streams." },
  ]);

  it("matches every word of a short query, the last one as a prefix", () => {
    expect(search("sign manif").map((result) => result.href)).toEqual(["/a"]);
    expect(search("manifest").map((result) => result.href)).toEqual(["/a", "/c"]);
    expect(search("the")).toEqual([]);
  });

  it("finds the entry for a pasted error message", () => {
    const [first] = search("Error: name the implementation to test with --impl");
    expect(first.href).toBe("/b#usage");
    expect(first.snippet).toContain("implementation");
  });

  it("indexes each written section of the documentation, with the page description", () => {
    const index = buildSearchIndex();
    expect(index.find((entry) => entry.href === "/docs/tools")?.text).toContain("which one you need");
    expect(index.some((entry) => entry.href === "/docs/tools/help#ask-on-github")).toBe(true);
    expect(index.some((entry) => entry.href.startsWith("/docs/tools/authoring"))).toBe(false);
  });
});

describe("terminal output", () => {
  it("colours verdicts and levels, and links each rule to its explanation", () => {
    render(
      <TerminalOutput>
        {[
          "✗ manifest.json: manifest that fails the checks (1 error)",
          "  error   limitations is empty.",
          "          rule events/producers · at /limitations",
          "✓ recording.jsonl: 5 facts, valid and declared",
        ].join("\n")}
      </TerminalOutput>,
    );
    expect(screen.getByRole("link", { name: "events/producers" })).toHaveAttribute("href", "/docs/tools/rules#events-producers");
    expect(screen.getByText("error")).toHaveClass("text-[var(--code-danger)]");
    expect(screen.getByText("✓")).toHaveClass("text-[var(--code-success)]");
    // What the reader copies is what hos printed.
    expect(screen.getByText(/recording.jsonl/).closest("pre")?.textContent).toContain("rule events/producers · at /limitations\n✓ recording.jsonl");
  });
});

describe("commands and shells", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => chooseShell("bash"));
  });

  it("copies the command of the chosen shell, and every block follows the choice", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <>
        <Command
          bash="curl -O https://example.com/a.json"
          cmd="curl -O https://example.com/a.json"
          powershell="curl.exe -O https://example.com/a.json"
        />
        <OsTabs>
          <Os name="powershell">Type npx.cmd.</Os>
          <Os name="cmd">Type npx.</Os>
          <Os name="bash">npx comes with Node.js.</Os>
        </OsTabs>
      </>,
    );

    fireEvent.click(screen.getAllByRole("tab", { name: "PowerShell" })[0]);
    expect(screen.getAllByRole("tabpanel").map((panel) => panel.textContent)).toEqual(["curl.exe -O https://example.com/a.json", "Type npx.cmd."]);
    for (const tab of screen.getAllByRole("tab", { name: "PowerShell" })) expect(tab).toHaveAttribute("aria-selected", "true");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy command" })));
    expect(writeText).toHaveBeenCalledWith("curl.exe -O https://example.com/a.json");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("keeps the choice for the page when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Command bash="ls" cmd="dir" powershell="Get-ChildItem" />);
    fireEvent.click(screen.getByRole("tab", { name: "Command Prompt" }));
    expect(within(screen.getByRole("tabpanel")).getByText("dir")).toBeVisible();
  });
});

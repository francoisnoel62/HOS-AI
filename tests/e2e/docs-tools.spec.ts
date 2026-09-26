import { expect, test } from "@playwright/test";

import { allToolsPages, toolsPages } from "@/lib/docs/tools";

test("the tools documentation reads in order, from the overview to Get help", async ({ page, isMobile }) => {
  test.skip(isMobile, "The same pages; the mobile menu has its own test.");
  await page.goto("/docs/tools");
  for (const [index, item] of toolsPages.entries()) {
    await expect(page).toHaveURL(new RegExp(`${item.href}$`));
    await expect(page.getByRole("heading", { level: 1, name: item.title })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Tools documentation" }).getByRole("link", { name: item.navTitle, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const next = toolsPages[index + 1];
    if (!next) {
      await expect(page.getByRole("link", { name: /^Next/ })).toHaveCount(0);
      break;
    }
    await page.getByRole("link", { name: new RegExp(`^Next\\s*${next.navTitle}$`) }).click();
  }
});

test("every link of the tools documentation leads somewhere, and every section link to its heading", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Links do not depend on the viewport.");
  const checked = new Set<string>();
  for (const item of allToolsPages) {
    await page.goto(item.href);
    const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        await expect(page.locator(`[id="${href.slice(1)}"]`), `${item.href} → ${href}`).toHaveCount(1);
        continue;
      }
      if (!href.startsWith("/")) continue;
      // Rule anchors are checked once the rules page exists (phase 4 of PLAN-SDK-DOC.md); the page itself must answer.
      const path = href.split("#")[0];
      if (checked.has(path)) continue;
      checked.add(path);
      expect((await request.get(path)).status(), `${item.href} → ${path}`).toBe(200);
    }
  }
});

test("a page that is not written yet stays out of search engines and the sitemap", async ({ page, request }) => {
  await page.goto("/docs/tools/quickstart");
  await expect(page.getByText("This page is being written.")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/docs/tools");
  expect((await request.get("/docs/tools/not-a-page")).status()).toBe(404);
});

test("the search finds a page from a few words or a pasted message, and / moves to it", async ({ page, isMobile }) => {
  await page.goto("/docs/tools");
  const search = page.getByRole("searchbox", { name: "Search the tools documentation" });
  if (isMobile) await search.click();
  else {
    await page.locator("body").press("/");
    await expect(search).toBeFocused();
  }
  await search.fill("sign manif");
  await expect(page.getByRole("status").filter({ hasText: /result/ })).toContainText("result");
  await page
    .getByRole("link", { name: /Sign and publish a producer manifest/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/docs\/tools\/guides\/sign-and-publish$/);

  await search.fill("a valid manifest with its limitations stated");
  await expect(page.getByRole("link", { name: /Check what a producer publishes/ }).first()).toBeVisible();
  await search.fill("zzzz qqqq");
  await expect(page.getByText("No result. Try fewer words, or the words of the error message.").last()).toBeVisible();
});

test("the reader chooses a shell once, for every block, and the browser remembers it", async ({ page }) => {
  await page.goto("/docs/tools/authoring");
  await page.getByRole("tab", { name: "PowerShell" }).first().click();
  await expect(page.getByText("curl.exe -O https://hos-ai.vercel.app/spec/0.1/examples/stay.expected.json")).toBeVisible();
  await expect(page.getByText("If PowerShell refuses to run npx")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "PowerShell" }).last()).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "macOS / Linux" }).last().click();
  await expect(page.getByText("On macOS and Linux, npx comes with Node.js.")).toBeVisible();
  await expect(page.getByText("If PowerShell refuses to run npx")).toBeHidden();
});

test("a glossary term shows its definition on focus, and links to the glossary", async ({ page, isMobile }) => {
  test.skip(isMobile, "Hover and focus behave the same on a phone.");
  await page.goto("/docs/tools/authoring");
  const term = page.getByRole("link", { name: "producer", exact: true });
  await term.focus();
  await expect(page.getByRole("tooltip")).toContainText("A system that publishes HOS facts");
  await term.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await term.click();
  await expect(page).toHaveURL(/\/docs\/tools\/glossary#producer$/);
  await expect(page.locator("#producer")).toContainText("Producer");
});

test("on a phone, the menu opens over the page and leads to every page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The sidebar is always open on a large screen.");
  await page.goto("/docs/tools/install");
  const menu = page.getByRole("button", { name: "Tools documentation menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page.getByRole("navigation", { name: "Tools documentation" }).getByRole("link", { name: "Troubleshooting" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Troubleshooting" })).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("each page links to a prefilled GitHub issue about itself", async ({ page }) => {
  await page.goto("/docs/tools/install");
  const href = await page.getByRole("link", { name: "Report a problem with this page" }).getAttribute("href");
  const url = new URL(href!);
  expect(url.pathname).toMatch(/\/issues\/new$/);
  expect(url.searchParams.get("title")).toBe("Docs: Install the tools");
  expect(url.searchParams.get("body")).toContain("/docs/tools/install");
});

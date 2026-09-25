import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/standard", "/standard/htng-opentravel", "/demo", "/demo/room-out-of-order", "/demo/late-checkout", "/demo/mews", "/demo/apaleo", "/demo/cloudbeds", "/docs/core", "/docs/events", "/participate", "/participate/founding-member", "/contact"]) {
  test(`critical route ${path} has no automatically detectable serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(serious).toEqual([]);
  });
}

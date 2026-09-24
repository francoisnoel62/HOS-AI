import { expect, test } from "@playwright/test";

test("homepage explains HOS and exposes the two primary participation paths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Hospitality operations need an operating layer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Become a founding member/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Run a pilot/i }).first()).toBeVisible();
  await expect(page.getByText("arrival.room_readiness_at_risk").first()).toBeVisible();
});

test("audience selector exposes a concrete value without navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Integrator" }).click();
  await expect(page.getByText("Industrialise mappings, replay tests and conformance evidence.")).toBeVisible();
});

test("theme can be changed with an accessible control", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const wasDark = await html.evaluate((element) => element.classList.contains("dark"));
  await page.getByRole("button", { name: /Switch to (light|dark) theme/i }).first().click();
  await expect(html).toHaveClass(wasDark ? /light/ : /dark/);
});

test("every participation path keeps a native form action and confidentiality warning", async ({ page }) => {
  for (const path of ["founding-member", "pilot", "technical-contributor", "financial-patron"]) {
    await page.goto(`/participate/${path}`);
    const form = page.locator("form");
    await expect(form).toHaveAttribute("action", `/api/forms/${path}`);
    await expect(form).toContainText(/do not include guest data, credentials, API keys/i);
  }
});

test("contact and confirmation routes are not indexable", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/thanks/pilot");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("mobile menu covers the viewport instead of overlapping page content", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The menu button is only rendered below the lg breakpoint.");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.height).toBe(viewport?.height);
  await dialog.getByRole("link", { name: "Roadmap" }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(dialog).toBeHidden();
});

test("live demo raises, then resolves, the arrival-readiness risk", async ({ page }) => {
  await page.goto("/demo");
  const next = page.getByRole("button", { name: "Deliver next event" });
  const projection = page.getByRole("region", { name: "Arrival-readiness projection" });
  for (let delivery = 1; delivery <= 6; delivery += 1) {
    await next.click();
    await expect(page.getByText(`${delivery} / 9`)).toBeVisible();
  }
  await expect(projection).toContainText("No situation");
  await expect(projection).toContainText("not authoritative");
  await next.click();
  await expect(projection).toContainText("Readiness at risk");
  await next.click();
  await next.click();
  await expect(projection).toContainText("Resolved");
  await expect(next).toBeDisabled();
});

test("documentation links to the published HOS Core draft and its artefacts", async ({ page, request }) => {
  await page.goto("/docs");
  await page.getByRole("link", { name: "HOS Core 0.1", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "HOS Core 0.1" })).toBeVisible();
  for (const file of ["schemas/hos-event.schema.json", "schemas/producer-manifest.schema.json", "conformance/arrival-readiness/events.jsonl", "conformance/arrival-readiness/expected.json"]) {
    expect((await request.get(`/spec/0.1/${file}`)).ok()).toBe(true);
  }
});

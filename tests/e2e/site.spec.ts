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

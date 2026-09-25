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
  for (let delivery = 1; delivery <= 9; delivery += 1) {
    await next.click();
    await expect(page.getByText(`${delivery} / 13`)).toBeVisible();
  }
  await expect(page.getByText("Undeclared · denied")).toBeVisible();
  await expect(projection).toContainText("No situation");
  await expect(projection).toContainText("not authoritative");
  await next.click();
  await expect(projection).toContainText("Readiness at risk");
  await next.click();
  await next.click();
  await expect(projection).toContainText("Resolved");
  await expect(projection).toContainText("inspected");
  await next.click();
  await expect(projection).toContainText("Stay in house");
  await expect(next).toBeDisabled();
});

for (const [pms, name, facts] of [
  ["mews", "Mews", 12],
  ["apaleo", "Apaleo", 13],
  ["cloudbeds", "Cloudbeds", 13],
] as const) {
  test(`${name} mapping replays the arrival scenario from ${name}-format PMS payloads`, async ({ page }) => {
    await page.goto(`/demo/${pms}`);
    await expect(page.getByText("Unofficial and experimental.")).toBeVisible();
    const next = page.getByRole("button", { name: "Deliver next event" });
    const projection = page.getByRole("region", { name: "Arrival-readiness projection" });
    await next.click();
    await expect(page.getByText(`Received from ${name} · delivery A`)).toBeVisible();
    let raised = false;
    for (let delivery = 2; delivery <= facts; delivery += 1) {
      await next.click();
      await expect(page.getByText(`${delivery} / ${facts}`)).toBeVisible();
      if (!raised && (await projection.getByText("Readiness at risk").isVisible())) {
        raised = true;
        await expect(projection).toContainText("not authoritative");
      }
    }
    expect(raised).toBe(true);
    await expect(projection).toContainText("Stay in house");
    await expect(next).toBeDisabled();
  });
}

test("live demo links to the three PMS mappings", async ({ page }) => {
  await page.goto("/demo");
  const mappings = page.locator("#pms-mappings");
  await expect(mappings.getByRole("table", { name: "How the three PMS APIs compare for the arrival scenario" })).toBeVisible();
  await mappings.getByRole("link", { name: /Replay from Apaleo/ }).click();
  await expect(page).toHaveURL(/\/demo\/apaleo$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Apaleo");
});

test("documentation links to the published HOS Core and HOS Events drafts and their artefacts", async ({ page, request }) => {
  await page.goto("/docs");
  await page.getByRole("link", { name: "HOS Core 0.1", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "HOS Core 0.1" })).toBeVisible();
  await page.goto("/docs");
  await page.getByRole("link", { name: "HOS Events 0.1", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "HOS Events 0.1" })).toBeVisible();
  const files = [
    "schemas/core.schema.json",
    "schemas/event-envelope.schema.json",
    "schemas/events.schema.json",
    "schemas/producer-manifest.schema.json",
    "schemas/reference/arrival-readiness.schema.json",
    "examples/guest.message.received.json",
    "conformance/arrival-readiness/events.jsonl",
    "conformance/arrival-readiness/expected.json",
  ];
  for (const file of files) expect((await request.get(`/spec/0.1/${file}`)).ok(), file).toBe(true);
});

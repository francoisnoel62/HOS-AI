import { expect, test } from "@playwright/test";

test("homepage explains HOS and exposes the two primary participation paths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Hospitality operations need an operating layer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Become a founding member/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Run a pilot/i }).first()).toBeVisible();
  await expect(page.getByText("Alert: room 204 may not be ready in time")).toBeVisible();
});

test("audience selector exposes a concrete value without navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "PMS vendor" }).click();
  await expect(page.getByText("Describe your data once, in an open format, and let hotel software partners connect more predictably.")).toBeVisible();
});

test("theme can be changed with an accessible control", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const wasDark = await html.evaluate((element) => element.classList.contains("dark"));
  await page
    .getByRole("button", { name: /Switch to (light|dark) theme/i })
    .first()
    .click();
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

test("the footer leads to every legal page", async ({ page }) => {
  for (const [link, heading] of [
    ["Privacy", "Privacy notice"],
    ["Terms of use", "Terms of use"],
    ["Legal notice", "Legal notice"],
    ["Accessibility", "Accessibility statement"],
  ] as const) {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("the legal notice names the publisher, the host and each licence", async ({ page }) => {
  await page.goto("/legal");
  await expect(page.locator("#publisher")).toContainText("Publication director");
  await expect(page.locator("#hosting")).toContainText("Vercel Inc.");
  await expect(page.getByRole("region", { name: "Licence of each kind of material" })).toContainText("Apache License 2.0");
  await expect(page.getByText("To complete:")).toHaveCount(0);
});

test("security.txt names a security contact", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/^Contact: mailto:\S+@\S+$/m);
});

test("every form states who uses the data and for how long", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator("form")).toContainText(/deletes it 12 months after our last exchange/);
  await expect(page.locator("form").getByRole("link", { name: "privacy notice" }).last()).toHaveAttribute("href", "/privacy#rights");
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

test("room-out-of-order demo resolves the risk when the guest is moved", async ({ page }) => {
  await page.goto("/demo");
  await page
    .getByRole("navigation", { name: "Conformance scenarios" })
    .getByRole("link", { name: /Room out of order/ })
    .click();
  await expect(page).toHaveURL(/\/demo\/room-out-of-order$/);
  const next = page.getByRole("button", { name: "Deliver next event" });
  const projection = page.getByRole("region", { name: "Arrival-readiness projection" });
  for (let delivery = 1; delivery <= 5; delivery += 1) await next.click();
  await expect(projection).toContainText("Readiness at risk");
  await expect(projection).toContainText("Maintenance window");
  await next.click();
  await next.click();
  await expect(page.getByText("Not authoritative", { exact: true })).toBeVisible();
  for (let delivery = 8; delivery <= 10; delivery += 1) await next.click();
  await expect(page.getByText("Older · not applied")).toBeVisible();
  await next.click();
  await expect(projection).toContainText("Resolved");
  await expect(projection).toContainText("stay_2051 · unit_318");
  for (let delivery = 12; delivery <= 14; delivery += 1) await next.click();
  await expect(page.getByText("14 / 14")).toBeVisible();
  await expect(projection).toContainText("Stay in house");
});

test("late-checkout demo holds the unit until the departing guest checks out", async ({ page }) => {
  await page.goto("/demo/late-checkout");
  await expect(page.getByRole("navigation", { name: "Conformance scenarios" }).getByRole("link", { name: /Late check-out/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const next = page.getByRole("button", { name: "Deliver next event" });
  const projection = page.getByRole("region", { name: "Arrival-readiness projection" });
  for (let delivery = 1; delivery <= 6; delivery += 1) await next.click();
  await expect(projection).toContainText("Unit still held by");
  await expect(projection).toContainText("stay_3088");
  await expect(projection).toContainText("No situation");
  await next.click();
  await expect(projection).toContainText("Readiness at risk");
  await expect(projection).toContainText("due to leave 17:00");
  for (let delivery = 8; delivery <= 10; delivery += 1) await next.click();
  await expect(projection).toContainText("Readiness at risk");
  await next.click();
  await expect(projection).toContainText("Resolved");
  await expect(projection).not.toContainText("Unit still held by");
  for (let delivery = 12; delivery <= 15; delivery += 1) await next.click();
  await expect(page.getByText("15 / 15")).toBeVisible();
  await expect(projection).toContainText("Stay in house");
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

test("the standard page leads to a sourced comparison with HTNG and OpenTravel", async ({ page }) => {
  await page.goto("/standard");
  await page.getByRole("link", { name: /Read the comparison/ }).click();
  await expect(page).toHaveURL(/\/standard\/htng-opentravel$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("They carry the messages. HOS makes the facts trustworthy.");
  await expect(page.getByText("status_front_office_occupancy")).toBeVisible();
  await expect(page.getByText("urn:hos:housekeeping:demo")).toBeVisible();
  await expect(page.getByRole("link", { name: /HTNG Express, official repository/ })).toHaveAttribute("href", "https://github.com/HTNG/htng-express");
  await page.getByRole("link", { name: /Replay delivery 8/ }).click();
  await expect(page).toHaveURL(/\/demo\/late-checkout$/);
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

test("the tools section leads to both packages and to the conformance protocol", async ({ page, request }) => {
  await page.goto("/docs");
  await page.getByRole("link", { name: "The hos command and the SDK", exact: true }).click();
  await expect(page).toHaveURL(/\/docs#tools$/);
  await expect(page.getByRole("heading", { level: 2, name: "Check your work from the command line." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Five-minute start" })).toHaveAttribute("href", "https://www.npmjs.com/package/@hos-ai/cli");
  await expect(page.getByRole("link", { name: "Examples" })).toHaveAttribute("href", "https://www.npmjs.com/package/@hos-ai/sdk");
  await expect(page.getByRole("link", { name: "conformance protocol" })).toHaveAttribute("href", "/spec/0.1/conformance/PROTOCOL.md");
  expect((await request.get("/spec/0.1/conformance/PROTOCOL.md")).ok()).toBe(true);
});

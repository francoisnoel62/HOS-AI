import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";

const expectOpacity = (element: Locator, value: string) =>
  expect.poll(() => element.evaluate((node) => getComputedStyle(node).opacity), { intervals: [40] }).toBe(value);

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`the story autoplays and loops until paused (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    const figure = page.getByRole("figure");
    await figure.scrollIntoViewIfNeeded();
    const rows = page.locator("[data-flow-event]");
    const alert = page.locator("[data-flow-alert]");
    const pause = page.getByRole("button", { name: "Pause arrival animation", exact: true });
    await expect(pause).toBeVisible();
    await expect
      .poll(() =>
        figure.evaluate((el) => {
          const animations = el.getAnimations({ subtree: true });
          return animations.length > 0 && animations.every((animation) => animation.playState === "running");
        }),
      )
      .toBe(true);

    // Replay gives the assertions a known starting point; autoplay was checked above.
    await page.getByRole("button", { name: "Replay arrival animation" }).click();
    for (let index = 0; index < 5; index += 1) {
      await expectOpacity(rows.nth(index), "1");
      if (index < 4) await expectOpacity(rows.nth(index + 1), "0");
      await expectOpacity(alert, "0");
    }
    await expectOpacity(alert, "1");
    await expect
      .poll(() => rows.nth(0).evaluate((el) => el.getAnimations()[0].effect?.getComputedTiming().currentIteration), { timeout: 10000 })
      .toBe(1);
    await expectOpacity(rows.nth(0), "1");
    await expect(pause).toBeVisible();
    await pause.click();
    await figure.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.ready)));
    const times = await rows.evaluateAll((elements) => elements.map((el) => el.getAnimations()[0].currentTime));
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await figure.scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Play arrival animation", exact: true })).toBeVisible();
    expect(await rows.evaluateAll((elements) => elements.map((el) => el.getAnimations()[0].currentTime))).toEqual(times);
    await page.getByRole("button", { name: "Play arrival animation", exact: true }).click();
    await expect(pause).toBeVisible();
    await expect.poll(() => rows.nth(0).evaluate((el) => el.getAnimations()[0].playState)).toBe("running");
  });
}

test("the illustration follows light and dark themes without losing its paused position", async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const figure = page.getByRole("figure");
  await page.getByRole("button", { name: "Pause arrival animation", exact: true }).click();
  await figure.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.ready)));
  await figure.evaluate((el) =>
    el.getAnimations({ subtree: true }).forEach((animation) => {
      animation.currentTime = 11000;
    }),
  );
  await expect(figure).toHaveCSS("background-color", "rgb(247, 250, 255)");
  const lightBorder = await page
    .locator("[data-source-card]")
    .first()
    .evaluate((el) => getComputedStyle(el).borderColor);
  await figure.screenshot({ path: testInfo.outputPath("arrival-light.png") });
  const lightA11y = await new AxeBuilder({ page }).include("figure").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(lightA11y.violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark theme" }).first().click();
  await expect(figure).toHaveCSS("background-color", "rgb(11, 20, 35)");
  expect(
    await page
      .locator("[data-source-card]")
      .first()
      .evaluate((el) => getComputedStyle(el).borderColor),
  ).not.toBe(lightBorder);
  expect(
    await figure.evaluate((el) =>
      el.getAnimations({ subtree: true }).every((animation) => animation.playState === "paused" && animation.currentTime === 11000),
    ),
  ).toBe(true);
  await figure.screenshot({ path: testInfo.outputPath("arrival-dark.png") });
  const darkA11y = await new AxeBuilder({ page }).include("figure").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(darkA11y.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

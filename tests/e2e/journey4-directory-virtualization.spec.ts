import { expect, test } from "@playwright/test";

test.describe("Journey 4 — Directory virtualization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sponsor-directory");
    await expect(page.getByText(/Showing .* of .* sponsors/)).toBeVisible({ timeout: 30000 });
  });

  test("first rows render at load with bounded mounted nodes", async ({ page }) => {
    const rows = page.locator("[data-index]");
    await expect(rows.first()).toBeVisible();
    const mounted = await rows.count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(45);
  });

  test("row set changes after scrolling to the bottom", async ({ page }) => {
    const firstName = await page.locator("[data-index='0']").textContent();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator("[data-index='0']")).toHaveCount(0, { timeout: 10000 });
    const last = page.locator("[data-index]:last-child");
    await expect(last).toBeVisible({ timeout: 10000 });
    const lastName = await last.textContent();
    expect(lastName).not.toBe(firstName);
  });

  test("result links navigate and stay keyboard-operable", async ({ page }) => {
    const firstLink = page.locator("[data-index='0'] a").first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/^\/sponsor\//);
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    await firstLink.press("Enter");
    await expect(page).toHaveURL(/\/sponsor\//, { timeout: 15000 });
  });

  test("mobile layout renders rows", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await context.newPage();
    try {
      await mobile.goto("/sponsor-directory");
      await expect(mobile.getByText(/Showing .* of .* sponsors/)).toBeVisible({ timeout: 30000 });
      await expect(mobile.locator("[data-index]").first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

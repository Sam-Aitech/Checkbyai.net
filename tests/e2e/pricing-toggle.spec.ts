import { test, expect } from "@playwright/test";

test.describe("Pricing billing cadence toggle", () => {
  test("defaults to annual pricing and hides the monthly grid", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByTestId("cadence-toggle-annual")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("£9.99")).toBeVisible();
    await expect(page.getByText("£24.99")).not.toBeVisible();
  });

  test("switching to monthly shows the monthly plans and hides annual", async ({ page }) => {
    await page.goto("/pricing");

    await page.getByTestId("cadence-toggle-monthly").click();

    await expect(page.getByTestId("cadence-toggle-monthly")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("£24.99")).toBeVisible();
    await expect(page.getByText("£9.99")).not.toBeVisible();
  });
});

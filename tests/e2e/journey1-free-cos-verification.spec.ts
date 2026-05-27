import { expect, test } from "@playwright/test";
import { cleanupE2EData, seedE2EData } from "./support/db-seed";

test.describe("Journey 1 — Free CoS verification", () => {
  let sponsorName = "";

  test.beforeEach(async () => {
    const seeded = await seedE2EData();
    sponsorName = seeded.sponsorName;
  });

  test.afterEach(async () => {
    await cleanupE2EData();
  });

  test("guest can search sponsor from homepage and see status", async ({ page }) => {
    await page.route("**/api/sponsors/search-index.json", async (route) => {
      await route.abort();
    });

    await page.goto("/");
    await page.getByPlaceholder("Search any employer — e.g. NHS, Tata, Deloitte…").fill(sponsorName);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(sponsorName)).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
  });
});

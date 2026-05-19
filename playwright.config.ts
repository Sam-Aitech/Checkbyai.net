import { defineConfig } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL;
if (!baseURL) {
  throw new Error("TEST_BASE_URL is required for Playwright E2E runs.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
});

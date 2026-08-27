import { test, expect } from "@playwright/test";

test.describe("Pricing inline checkout (logged-out)", () => {
  test("clicking a plan CTA reveals inline email capture instead of navigating to /login", async ({ page }) => {
    await page.goto("/pricing");

    const cta = page.getByTestId("pricing-plan-cta").first();
    await expect(cta).toBeVisible();
    await cta.click();

    // Must NOT navigate away
    await expect(page).toHaveURL(/\/pricing/);

    // Inline email field appears in place of the button
    await expect(page.getByTestId("inline-checkout-email")).toBeVisible();
  });

  test("completes the email -> OTP -> checkout handoff without leaving the page", async ({ page }) => {
    let checkoutCalled = false;

    await page.route("**/api/auth/email/send-otp", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "sent" }) })
    );
    await page.route("**/api/auth/email/verify-otp", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "ok", user: { id: "test-user", email: "e2e@example.com" } }),
      })
    );
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "test-user", email: "e2e@example.com" }),
      })
    );
    await page.route("**/api/checkout/credits", (route) => {
      checkoutCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: "https://checkout.stripe.com/test-session" } }),
      });
    });

    await page.goto("/pricing");
    await page.getByTestId("pricing-plan-cta").first().click();

    await page.getByTestId("inline-checkout-email").fill("e2e@example.com");
    await page.getByTestId("inline-checkout-send").click();

    await expect(page.getByTestId("inline-checkout-code")).toBeVisible();
    await page.getByTestId("inline-checkout-code").fill("123456");
    await page.getByTestId("inline-checkout-verify").click();

    await expect.poll(() => checkoutCalled).toBe(true);
  });
});

test.describe("Pricing checkout (already logged in)", () => {
  test("logged-in visitors skip the inline capture entirely", async ({ page }) => {
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "existing-user", email: "existing@example.com" }),
      })
    );
    let checkoutCalled = false;
    await page.route("**/api/checkout/credits", (route) => {
      checkoutCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: "https://checkout.stripe.com/test-session" } }),
      });
    });

    await page.goto("/pricing");
    await page.getByTestId("pricing-plan-cta").first().click();

    // No inline email field should appear for an already-authenticated visitor
    await expect(page.getByTestId("inline-checkout-email")).not.toBeVisible();
    await expect.poll(() => checkoutCalled).toBe(true);
  });
});

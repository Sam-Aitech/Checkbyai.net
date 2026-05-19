import { expect, type Page } from "@playwright/test";

export async function loginWithPassword(page: Page, email: string, password: string): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

export async function logout(page: Page): Promise<void> {
  await page.request.post("/api/auth/logout");
}

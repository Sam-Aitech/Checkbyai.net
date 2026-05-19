import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./support/auth";
import { cleanupE2EData, E2E_USERS, seedE2EData } from "./support/db-seed";

test.describe("Journey 2 — Paid submission IDOR protection", () => {
  let submissionId = 0;

  test.beforeEach(async () => {
    const seeded = await seedE2EData();
    submissionId = seeded.paidSubmissionId;
  });

  test.afterEach(async () => {
    await cleanupE2EData();
  });

  test("user B cannot access user A paid submission status URL", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginWithPassword(pageA, E2E_USERS.userA.email, E2E_USERS.userA.password);

    const ownStatusResponse = await pageA.request.get(`/api/paid/status/${submissionId}`);
    expect(ownStatusResponse.status()).toBe(200);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginWithPassword(pageB, E2E_USERS.userB.email, E2E_USERS.userB.password);

    const forbiddenResponse = await pageB.request.get(`/api/paid/status/${submissionId}`, { maxRedirects: 0 });
    const blocked = forbiddenResponse.status() === 403 || [301, 302, 303, 307, 308].includes(forbiddenResponse.status());
    expect(blocked).toBeTruthy();

    await contextA.close();
    await contextB.close();
  });
});

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./support/auth";
import { cleanupE2EData, E2E_USERS, seedE2EData } from "./support/db-seed";

const fixtureBuffer = readFileSync(new URL("./fixtures/sample-cos.pdf", import.meta.url));

test.describe("Journey 3 — PDF upload and metadata extraction", () => {
  test.beforeEach(async () => {
    await seedE2EData();
  });

  test.afterEach(async () => {
    await cleanupE2EData();
  });

  test("authenticated user can upload PDF and traversal filename is rejected", async ({ page }) => {
    await loginWithPassword(page, E2E_USERS.uploadUser.email, E2E_USERS.uploadUser.password);

    const uploadResponse = await page.request.post("/api/verify", {
      multipart: {
        file: {
          name: "sample-cos.pdf",
          mimeType: "application/pdf",
          buffer: fixtureBuffer,
        },
      },
    });

    expect(uploadResponse.ok()).toBeTruthy();
    const payload = await uploadResponse.json();
    expect(typeof payload.documentHash).toBe("string");
    expect(payload.documentHash.length).toBeGreaterThan(0);
    expect(payload.metadata?.pageCount).not.toBeNull();

    const traversalResponse = await page.request.post("/api/verify", {
      multipart: {
        file: {
          name: "../../etc/passwd.pdf",
          mimeType: "application/pdf",
          buffer: fixtureBuffer,
        },
      },
    });

    expect(traversalResponse.status()).toBe(400);
  });
});

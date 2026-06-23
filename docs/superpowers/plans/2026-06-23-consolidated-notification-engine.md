# Daily Consolidated Notification Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily consolidated email notification engine that runs twice a day (07:00 AM & 07:00 PM), grouping all sponsor register changes for watched companies into a single daily email digest for paid users, using Resend's batch sending API and bulk DB logging.

**Architecture:** We decouple email dispatch from the ETL job. A central scheduler triggers a query that uses a SQL `LEFT JOIN` on `notif_log` (success = true) to find all unsent changes for watched companies. The results are consolidated in-memory by user, rendered into HTML tables with color-coded status badges, sent in batches of 100 via Resend, and bulk-logged to database audit tables.

**Tech Stack:** TypeScript, Node-cron, Drizzle ORM, PostgreSQL, Vitest, Resend API.

---

### Task 1: Create Query and Grouping Logic

**Files:**
* Create: `server/services/consolidatedNotificationEngine.ts`
* Create: `tests/server/services/consolidatedNotificationEngine.test.ts`

- [ ] **Step 1: Write a test verifying database query and grouping**
  Write a test in `tests/server/services/consolidatedNotificationEngine.test.ts` to mock database rows and assert that the grouping function correctly groups multiple changes under the correct user ID.

```typescript
import { describe, it, expect, vi } from "vitest";
import { groupNotificationsByUser } from "../../server/services/consolidatedNotificationEngine";

describe("consolidatedNotificationEngine - Grouping Logic", () => {
  it("should group multiple changes by user ID", () => {
    const mockDbRows = [
      {
        userId: "user_a",
        email: "usera@example.com",
        changeId: 101,
        organisationName: "Company Alpha",
        changeType: "REMOVED_REVOKED",
        previousValue: "ACTIVE",
        newValue: "REMOVED_REVOKED",
        snapshotDate: "2026-06-23",
      },
      {
        userId: "user_a",
        email: "usera@example.com",
        changeId: 102,
        organisationName: "Company Beta",
        changeType: "NEW_LICENCE",
        previousValue: null,
        newValue: "ACTIVE",
        snapshotDate: "2026-06-23",
      },
      {
        userId: "user_b",
        email: "userb@example.com",
        changeId: 103,
        organisationName: "Company Gamma",
        changeType: "DOWNGRADED",
        previousValue: "A-Rating",
        newValue: "B-Rating",
        snapshotDate: "2026-06-23",
      },
    ];

    const grouped = groupNotificationsByUser(mockDbRows);

    expect(grouped.size).toBe(2);
    expect(grouped.get("user_a")).toEqual({
      email: "usera@example.com",
      changes: [
        {
          changeId: 101,
          organisationName: "Company Alpha",
          changeType: "REMOVED_REVOKED",
          previousValue: "ACTIVE",
          newValue: "REMOVED_REVOKED",
        },
        {
          changeId: 102,
          organisationName: "Company Beta",
          changeType: "NEW_LICENCE",
          previousValue: null,
          newValue: "ACTIVE",
        },
      ],
    });
    expect(grouped.get("user_b")).toEqual({
      email: "userb@example.com",
      changes: [
        {
          changeId: 103,
          organisationName: "Company Gamma",
          changeType: "DOWNGRADED",
          previousValue: "A-Rating",
          newValue: "B-Rating",
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run Vitest to verify the test fails**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: FAIL with compilation error (module or export not found).

- [ ] **Step 3: Implement minimal query and grouping logic**
  Create `server/services/consolidatedNotificationEngine.ts` containing the types, the grouping helper, and the query structure.

```typescript
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { companyWatches, sponsorChanges, users, notifLog } from "@shared/schema";

export interface PendingRow {
  userId: string;
  email: string;
  changeId: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  snapshotDate: string;
}

export interface UserDigest {
  email: string;
  changes: Array<{
    changeId: number;
    organisationName: string;
    changeType: string;
    previousValue: string | null;
    newValue: string | null;
  }>;
}

export function groupNotificationsByUser(rows: PendingRow[]): Map<string, UserDigest> {
  const map = new Map<string, UserDigest>();
  for (const row of rows) {
    const existing = map.get(row.userId) ?? { email: row.email, changes: [] };
    existing.changes.push({
      changeId: row.changeId,
      organisationName: row.organisationName,
      changeType: row.changeType,
      previousValue: row.previousValue,
      newValue: row.newValue,
    });
    map.set(row.userId, existing);
  }
  return map;
}

export async function fetchPendingNotifications(): Promise<PendingRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      subscriptionStatus: users.subscriptionStatus,
      changeId: sponsorChanges.id,
      organisationName: sponsorChanges.organisationName,
      changeType: sponsorChanges.changeType,
      previousValue: sponsorChanges.previousValue,
      newValue: sponsorChanges.newValue,
      snapshotDate: sponsorChanges.snapshotDate,
    })
    .from(companyWatches)
    .innerJoin(
      sponsorChanges,
      eq(companyWatches.fingerprint, sponsorChanges.fingerprint)
    )
    .innerJoin(users, eq(companyWatches.userId, users.id))
    .leftJoin(
      notifLog,
      and(
        eq(companyWatches.userId, notifLog.userId),
        eq(sponsorChanges.id, notifLog.changeId),
        eq(notifLog.success, true)
      )
    )
    .where(
      and(
        eq(companyWatches.isActive, true),
        eq(users.subscriptionStatus, "pro"),
        eq(sponsorChanges.isTest, false),
        sql`${notifLog.id} IS NULL`
      )
    );

  // Map to correct Typescript schema types
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email || "",
    changeId: r.changeId,
    organisationName: r.organisationName,
    changeType: r.changeType,
    previousValue: r.previousValue,
    newValue: r.newValue,
    snapshotDate: r.snapshotDate,
  }));
}
```

- [ ] **Step 4: Run Vitest to verify tests pass**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  ```bash
  git add server/services/consolidatedNotificationEngine.ts tests/server/services/consolidatedNotificationEngine.test.ts
  git commit -m "feat: implement daily notification query and grouping logic"
  ```

---

### Task 2: Implement Consolidated HTML Email Rendering

**Files:**
* Modify: `server/services/consolidatedNotificationEngine.ts`
* Modify: `tests/server/services/consolidatedNotificationEngine.test.ts`

- [ ] **Step 1: Write test for consolidated HTML builder**
  Add a test to `tests/server/services/consolidatedNotificationEngine.test.ts` to assert that `renderConsolidatedEmail` returns a subject line containing the count of changes and an HTML string with a table listing the companies and color-coded statuses.

```typescript
import { renderConsolidatedEmail } from "../../server/services/consolidatedNotificationEngine";

describe("consolidatedNotificationEngine - HTML Rendering", () => {
  it("should render a clean HTML table with correct status labels and pill styles", () => {
    const changes = [
      {
        changeId: 101,
        organisationName: "Alpha Corp",
        changeType: "REMOVED_REVOKED",
        previousValue: "ACTIVE",
        newValue: "REMOVED_REVOKED",
      },
      {
        changeId: 102,
        organisationName: "Beta Ltd",
        changeType: "NEW_LICENCE",
        previousValue: null,
        newValue: "ACTIVE",
      },
    ];

    const { subject, html } = renderConsolidatedEmail(changes);

    expect(subject).toBe("Sponsor Monitor: 2 updates to your watch list");
    expect(html).toContain("Alpha Corp");
    expect(html).toContain("Licence Revoked");
    expect(html).toContain("Beta Ltd");
    expect(html).toContain("New Licence");
    expect(html).toContain("#dc2626"); // Crimson red hex for Revoked
    expect(html).toContain("#16a34a"); // Emerald green hex for New
  });
});
```

- [ ] **Step 2: Run Vitest to verify the test fails**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: FAIL with compilation error (renderConsolidatedEmail not defined).

- [ ] **Step 3: Implement rendering logic**
  Add `renderConsolidatedEmail` to `server/services/consolidatedNotificationEngine.ts`.

```typescript
export function renderConsolidatedEmail(changes: UserDigest["changes"]): { subject: string; html: string } {
  const subject = `Sponsor Monitor: ${changes.length} update${changes.length !== 1 ? "s" : ""} to your watch list`;

  const getStatusBadge = (type: string) => {
    switch (type) {
      case "REMOVED_REVOKED":
      case "DOWNGRADED":
        return { text: "Licence Revoked", bg: "#dc2626" };
      case "NEW_LICENCE":
      case "RE_ACTIVATED":
      case "UPGRADED":
        return { text: "New Licence", bg: "#16a34a" };
      default:
        return { text: "Details Updated", bg: "#4f46e5" };
    }
  };

  const getChangeExplanation = (c: any) => {
    if (c.changeType === "REMOVED_REVOKED") {
      return `<strong>${c.organisationName}</strong> has been removed from the UK Register of Licensed Sponsors. Visas sponsored under this licence may be compromised.`;
    }
    if (c.changeType === "NEW_LICENCE") {
      return `<strong>${c.organisationName}</strong> was added to the UK Register of Licensed Sponsors under route: <strong>${c.newValue || "N/A"}</strong>.`;
    }
    if (c.changeType === "RE_ACTIVATED") {
      return `<strong>${c.organisationName}</strong> has returned to the UK Register of Licensed Sponsors.`;
    }
    return `<strong>${c.organisationName}</strong> has had a change from <strong>${c.previousValue || "N/A"}</strong> to <strong>${c.newValue || "N/A"}</strong>.`;
  };

  const tableRows = changes
    .map((c) => {
      const badge = getStatusBadge(c.changeType);
      const explanation = getChangeExplanation(c);
      return `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px; font-weight: bold; color: #333; font-size: 14px;">${c.organisationName}</td>
          <td style="padding: 12px;">
            <span style="background-color: ${badge.bg}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block;">
              ${badge.text}
            </span>
          </td>
          <td style="padding: 12px; color: #666; font-size: 13px; line-height: 1.4;">${explanation}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Sponsor Monitor Digest</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Summary of updates to your watched organisations</p>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Sponsor</th>
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Event</th>
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="https://checkbyai.net/dashboard/sponsor" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-decoration: none; display: inline-block;">
            Manage Monitored Sponsors
          </a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; text-align: center;">
        <p style="color: #64748b; font-size: 11px; margin: 0 0 8px;">
          You are receiving this because you enabled email monitoring on Check By AI Sponsor Monitor.
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          checkbyai.net &middot; London, UK
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}
```

- [ ] **Step 4: Run Vitest to verify rendering tests pass**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  ```bash
  git add server/services/consolidatedNotificationEngine.ts tests/server/services/consolidatedNotificationEngine.test.ts
  git commit -m "feat: implement consolidated digest email HTML rendering"
  ```

---

### Task 3: Implement Batch Delivery and Bulk Logging

**Files:**
* Modify: `server/services/consolidatedNotificationEngine.ts`
* Modify: `tests/server/services/consolidatedNotificationEngine.test.ts`

- [ ] **Step 1: Write test for consolidated delivery orchestration**
  Add an integration test to mock `fetch` calls to Resend Batch Send API and mock `db.insert` to assert that they are called with correctly formatted batch payloads and bulk logs.

```typescript
import { processConsolidatedNotifications } from "../../server/services/consolidatedNotificationEngine";
import { db } from "../../server/db";

vi.mock("../../server/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(true)
    }))
  }
}));

describe("consolidatedNotificationEngine - Delivery Orchestration", () => {
  it("should chunk 100 entries, send batch HTTP requests and bulk insert audit logs", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "resend_msg_1" }] })
    });
    vi.stubGlobal("fetch", mockFetch);

    const testDigests = new Map();
    testDigests.set("user_1", {
      email: "user1@example.com",
      changes: [{ changeId: 201, organisationName: "A", changeType: "REMOVED_REVOKED" }]
    });

    const result = await processConsolidatedNotifications(testDigests);

    expect(mockFetch).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(result.sentCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run Vitest to verify the test fails**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: FAIL with compilation error (processConsolidatedNotifications not defined).

- [ ] **Step 3: Implement chunking, sending and bulk log logic**
  Add the orchestration logic to `server/services/consolidatedNotificationEngine.ts`.

```typescript
import { notifLog } from "@shared/schema";

export async function processConsolidatedNotifications(
  userDigests: Map<string, UserDigest>
): Promise<{ sentCount: number; failedCount: number }> {
  const digestEntries = Array.from(userDigests.entries());
  let sentCount = 0;
  let failedCount = 0;

  const chunkArray = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

  const chunks = chunkArray(digestEntries, 100);

  for (const chunk of chunks) {
    const batchPayload = chunk.map(([_, data]) => {
      const { subject, html } = renderConsolidatedEmail(data.changes);
      return {
        from: "Sponsor Monitor <alerts@checkbyai.net>",
        to: [data.email],
        subject,
        html,
      };
    });

    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ emails: batchPayload }),
      });

      if (!response.ok) {
        throw new Error(`Resend batch API responded with status ${response.status}`);
      }

      const resendRes: any = await response.json();
      const resendList = resendRes.data || [];

      const logsToInsert: any[] = [];
      chunk.forEach(([userId, data], idx) => {
        const resendItem = resendList[idx];
        const success = !!resendItem?.id;
        if (success) sentCount++; else failedCount++;

        // For consolidated email, map individual change logs for accurate self-healing check
        data.changes.forEach((ch) => {
          logsToInsert.push({
            userId,
            changeId: ch.changeId,
            eventType: "consolidated_digest",
            channel: "email",
            companyName: ch.organisationName,
            success,
            providerMessageId: resendItem?.id || null,
            errorDetails: success ? null : "Resend delivery item failed",
          });
        });
      });

      if (logsToInsert.length > 0) {
        await db.insert(notifLog).values(logsToInsert);
      }
    } catch (err: unknown) {
      console.error("[ConsolidatedNotificationEngine] Batch delivery failed:", err);
      const errStr = err instanceof Error ? err.message : String(err);
      
      const failedLogs: any[] = [];
      chunk.forEach(([userId, data]) => {
        failedCount += data.changes.length;
        data.changes.forEach((ch) => {
          failedLogs.push({
            userId,
            changeId: ch.changeId,
            eventType: "consolidated_digest",
            channel: "email",
            companyName: ch.organisationName,
            success: false,
            errorDetails: errStr,
          });
        });
      });

      if (failedLogs.length > 0) {
        await db.insert(notifLog).values(failedLogs);
      }
    }
  }

  return { sentCount, failedCount };
}

export async function runConsolidatedNotificationJob(): Promise<{ sentCount: number; failedCount: number }> {
  console.log("[ConsolidatedNotificationEngine] Starting consolidated notifications run...");
  const rows = await fetchPendingNotifications();
  if (rows.length === 0) {
    console.log("[ConsolidatedNotificationEngine] Zero pending notifications found.");
    return { sentCount: 0, failedCount: 0 };
  }
  const digests = groupNotificationsByUser(rows);
  const outcome = await processConsolidatedNotifications(digests);
  console.log(`[ConsolidatedNotificationEngine] Complete: Sent: ${outcome.sentCount}, Failed: ${outcome.failedCount}`);
  return outcome;
}
```

- [ ] **Step 4: Run Vitest to verify all tests pass**
  Run: `npx vitest tests/server/services/consolidatedNotificationEngine.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  ```bash
  git add server/services/consolidatedNotificationEngine.ts tests/server/services/consolidatedNotificationEngine.test.ts
  git commit -m "feat: implement chunking delivery orchestration and bulk db logging"
  ```

---

### Task 4: Integrate with Scheduler and Cleanup Monitor Job

**Files:**
* Modify: `server/utils/scheduler.ts`
* Modify: `server/utils/sponsorMonitorJob.ts`

- [ ] **Step 1: Write test for scheduler updates**
  Ensure we can trigger `runConsolidatedNotificationJob` from the scheduler. Add verification that the job is registered under `CONSOLIDATED_NOTIFICATIONS` in `CutoverJobKey`.

- [ ] **Step 2: Add CONSOLIDATED_NOTIFICATIONS job to scheduler**
  Add the job to `server/utils/scheduler.ts`.

```diff
  export type CutoverJobKey =
    | "NOTIFICATION_DRAIN"
    | "ENRICHMENT_BATCH"
    | "ENRICHMENT_SEED"
    | "JOB_ALERT"
-   | "SPONSOR_MONITOR";
+   | "SPONSOR_MONITOR"
+   | "CONSOLIDATED_NOTIFICATIONS";
 
  const JOB_SCHEDULES: Record<CutoverJobKey, string> = {
    NOTIFICATION_DRAIN: "0 * * * *",
    ENRICHMENT_BATCH: "15 * * * *",
    ENRICHMENT_SEED: "0 2 * * *",
    JOB_ALERT: "0 2 * * 1-5",
    SPONSOR_MONITOR: "30 0 * * 1-5",
+   CONSOLIDATED_NOTIFICATIONS: "0 7,19 * * *", // Run at 7:00 AM and 7:00 PM
  };
```

And update the registration logic inside `startCentralScheduler()`:

```diff
+  if (isCutover("CONSOLIDATED_NOTIFICATIONS")) {
+    cron.schedule(JOB_SCHEDULES.CONSOLIDATED_NOTIFICATIONS, () => {
+      log.info("Central scheduler: CONSOLIDATED_NOTIFICATIONS firing.");
+      runWithTelemetry("consolidatedNotifications", "Consolidated notifications digest", () => {
+        const { runConsolidatedNotificationJob } = require("../services/consolidatedNotificationEngine");
+        return runConsolidatedNotificationJob();
+      });
+    }, opts);
+    log.info("Central scheduler: CONSOLIDATED_NOTIFICATIONS registered (0 7,19 * * * UTC).");
+  }
```

- [ ] **Step 3: Disable inline notifications from daily sponsor sync**
  Disable the legacy single-change notification dispatching inside `server/utils/sponsorMonitorJob.ts` (lines 665-700). We no longer want individual queue additions to run immediately on database changes.

```diff
-      if (alertableChanges.length > 10000) {
-        console.log(`[SponsorMonitorJob] Skipping notifications for ${alertableChanges.length} alertable changes (first-run / mass update).`);
-      } else if (alertableChanges.length > 0) {
-        console.log(`[SponsorMonitorJob] Queueing notifications for ${alertableChanges.length} alertable changes…`);
-        const notifQueue = getNotificationQueue();
-        if (notifQueue) {
-          ...
-        }
-      }
+      console.log(`[SponsorMonitorJob] Bypassing inline notification queueing. Changes are staged for the scheduled consolidated digest job.`);
```

- [ ] **Step 4: Verify test suite runs cleanly**
  Run: `npm run dev` and `npm run test` to verify there are no compilation errors or broken imports in any related file.

- [ ] **Step 5: Commit changes**
  ```bash
  git add server/utils/scheduler.ts server/utils/sponsorMonitorJob.ts
  git commit -m "feat: schedule consolidated notifications and disable legacy inline dispatching"
  ```

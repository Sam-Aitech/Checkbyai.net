import { describe, it, expect } from "vitest";
import { groupNotificationsByUser, renderConsolidatedEmail } from "../../../server/services/consolidatedNotificationEngine";

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

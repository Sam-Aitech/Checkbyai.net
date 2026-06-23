import { describe, it, expect } from "vitest";
import { groupNotificationsByUser } from "../../../server/services/consolidatedNotificationEngine";

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

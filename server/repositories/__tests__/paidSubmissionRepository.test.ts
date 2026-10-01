import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ where: [] as any[] }));

// Tag drizzle operators so the WHERE tree can be inspected without a database.
vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ op: "and", args }),
  eq: (col: any, val: any) => ({ op: "eq", col: col?.name ?? col, val }),
  desc: (col: any) => ({ op: "desc", col }),
}));

vi.mock("@shared/schema", () => ({
  paidSubmissions: {
    id: { name: "id" },
    userId: { name: "userId" },
    stripeSessionId: { name: "stripeSessionId" },
    reviewStatus: { name: "reviewStatus" },
    priority: { name: "priority" },
    createdAt: { name: "createdAt" },
    assignedTo: { name: "assignedTo" },
  },
}));

vi.mock("../../db", () => {
  const chain = (rows: any[]) => ({
    where: (w: any) => {
      captured.where.push(w);
      return { returning: async () => rows, then: (r: any) => Promise.resolve(rows).then(r) };
    },
  });
  return {
    db: {
      select: () => ({ from: () => chain([{ id: 1, userId: "owner" }]) }),
      update: () => ({ set: () => chain([{ id: 1, userId: "owner" }]) }),
    },
  };
});

import { PaidSubmissionRepository } from "../paidSubmissionRepository";

function flatten(node: any): any[] {
  return node?.op === "and" ? node.args.flatMap(flatten) : [node];
}

describe("PaidSubmissionRepository owner scoping", () => {
  const repo = new PaidSubmissionRepository();
  beforeEach(() => {
    captured.where = [];
  });

  it("getPaidSubmissionForUser constrains by BOTH id and owner in the WHERE clause", async () => {
    await repo.getPaidSubmissionForUser(7, "owner");
    const terms = flatten(captured.where[0]);
    expect(terms).toContainEqual({ op: "eq", col: "id", val: 7 });
    expect(terms).toContainEqual({ op: "eq", col: "userId", val: "owner" });
  });

  it("getPaidSubmissionBySessionIdForUser constrains by session id and owner", async () => {
    await repo.getPaidSubmissionBySessionIdForUser("cs_1", "owner");
    const terms = flatten(captured.where[0]);
    expect(terms).toContainEqual({ op: "eq", col: "stripeSessionId", val: "cs_1" });
    expect(terms).toContainEqual({ op: "eq", col: "userId", val: "owner" });
  });

  it("updatePaidSubmissionForUser scopes the write by id and owner", async () => {
    await repo.updatePaidSubmissionForUser(7, "owner", { employerName: "x" } as any);
    const terms = flatten(captured.where[0]);
    expect(terms).toContainEqual({ op: "eq", col: "id", val: 7 });
    expect(terms).toContainEqual({ op: "eq", col: "userId", val: "owner" });
  });

  it("refuses to query at all without a principal", async () => {
    await expect(repo.getPaidSubmissionForUser(7, "")).resolves.toBeUndefined();
    await expect(repo.getPaidSubmissionBySessionIdForUser("cs_1", "")).resolves.toBeUndefined();
    await expect(repo.updatePaidSubmissionForUser(7, "", {})).resolves.toBeUndefined();
    expect(captured.where).toHaveLength(0);
  });
});

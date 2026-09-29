import { describe, it, expect, vi, beforeEach } from "vitest";

const chain = vi.hoisted(() => {
  const c: any = {};
  for (const k of ["update", "set", "where", "returning", "insert", "values"]) {
    c[k] = vi.fn(() => c);
  }
  // Awaiting the chain resolves to a row so `.returning()` style callers work.
  c.then = (resolve: (v: unknown) => void) => resolve([{ id: "u1" }]);
  return c;
});

vi.mock("../../db", () => ({ db: chain }));

import { userRepository } from "../userRepository";
import { getCachedUser, invalidateUserCache } from "../../utils/userCache";
import type { User } from "@shared/schema";

const user = (extra: Record<string, unknown> = {}) =>
  ({ id: "u1", role: "user", ...extra }) as unknown as User;

describe("userRepository cache invalidation", () => {
  beforeEach(() => invalidateUserCache());

  it("drops the cached session user after updateUserRestriction", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(user({ isRestricted: true }));

    await getCachedUser("u1", fetcher);
    await getCachedUser("u1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); // cached

    await userRepository.updateUserRestriction("u1", true, "abuse");

    const after = await getCachedUser("u1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(after).toMatchObject({ isRestricted: true });
  });

  it("drops the cached session user after deleteUser", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(undefined);

    await getCachedUser("u1", fetcher);
    await userRepository.deleteUser("u1");

    expect(await getCachedUser("u1", fetcher)).toBe(false);
  });

  it("invalidates even when the write fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(user());
    await getCachedUser("u1", fetcher);

    chain.where.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    await expect(userRepository.updateUserRestriction("u1", true)).rejects.toThrow("db down");

    await getCachedUser("u1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

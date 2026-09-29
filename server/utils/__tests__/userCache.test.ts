import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCachedUser, invalidateUserCache, getUserCacheSize } from "../userCache";
import type { User } from "@shared/schema";

const makeUser = (id: string): User =>
  ({ id, email: `${id}@example.com`, role: "user" }) as unknown as User;

describe("getCachedUser", () => {
  beforeEach(() => {
    invalidateUserCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches positive lookups within the TTL window", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeUser("u1"));

    const first = await getCachedUser("u1", fetcher);
    const second = await getCachedUser("u1", fetcher);

    expect(first).toMatchObject({ id: "u1" });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes from the source after the TTL expires", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeUser("u1"));

    await getCachedUser("u1", fetcher);
    vi.advanceTimersByTime(16_000);
    await getCachedUser("u1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("negatively caches unknown users", async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);

    const first = await getCachedUser("ghost", fetcher);
    const second = await getCachedUser("ghost", fetcher);

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("single-flights concurrent misses for the same user", async () => {
    let resolveFetch!: (user: User) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<User>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const p1 = getCachedUser("u1", fetcher);
    const p2 = getCachedUser("u1", fetcher);
    const p3 = getCachedUser("u1", fetcher);

    resolveFetch(makeUser("u1"));
    const [a, b, c] = await Promise.all([p1, p2, p3]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not cache failed lookups", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(makeUser("u1"));

    await expect(getCachedUser("u1", fetcher)).rejects.toThrow("db down");
    const recovered = await getCachedUser("u1", fetcher);

    expect(recovered).toMatchObject({ id: "u1" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidates a single user and the whole cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeUser("u1"));

    await getCachedUser("u1", fetcher);
    await getCachedUser("u1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    invalidateUserCache("u1");
    await getCachedUser("u1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);

    invalidateUserCache();
    expect(getUserCacheSize()).toBe(0);
  });
  it("expires negative entries after the short negative TTL", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makeUser("late"));

    expect(await getCachedUser("late", fetcher)).toBe(false);
    vi.advanceTimersByTime(2_500);
    expect(await getCachedUser("late", fetcher)).toMatchObject({ id: "late" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache a fetch that was invalidated while in flight", async () => {
    let resolveStale!: (user: User) => void;
    const stale = new Promise<User>((resolve) => {
      resolveStale = resolve;
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(stale)
      .mockResolvedValueOnce({ ...makeUser("u1"), role: "restricted" } as unknown as User);

    const inFlight = getCachedUser("u1", fetcher);
    invalidateUserCache("u1"); // write lands while the old read is pending
    resolveStale(makeUser("u1"));
    await inFlight;

    // The stale result must not have been stored: next read hits the source.
    const fresh = await getCachedUser("u1", fetcher);
    expect(fresh).toMatchObject({ role: "restricted" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh fetch after invalidation instead of joining a stale flight", async () => {
    let resolveStale!: (user: User) => void;
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(new Promise<User>((r) => (resolveStale = r)))
      .mockResolvedValueOnce(makeUser("u1"));

    const first = getCachedUser("u1", fetcher);
    invalidateUserCache("u1");
    const second = await getCachedUser("u1", fetcher);
    resolveStale(makeUser("u1"));
    await first;

    expect(second).toMatchObject({ id: "u1" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("survives fetchers that throw synchronously without wedging the key", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("sync boom");
      })
      .mockResolvedValueOnce(makeUser("u1"));

    await expect(getCachedUser("u1", fetcher)).rejects.toThrow("sync boom");
    expect(await getCachedUser("u1", fetcher)).toMatchObject({ id: "u1" });
  });
});

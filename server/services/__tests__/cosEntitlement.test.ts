import { describe, expect, it } from "vitest";
import { resolveCosEntitlement } from "@shared/cosEntitlement";

const TODAY = "2026-09-15";

describe("resolveCosEntitlement", () => {
  it("treats an explicit admin unlimited limit as unlimited without changing the Pro plan", () => {
    expect(
      resolveCosEntitlement(
        { subscriptionStatus: "pro", verificationLimit: -1, credits: 0 },
        1,
        TODAY,
      ),
    ).toMatchObject({
      subscriptionStatus: "pro",
      hasAccess: true,
      canVerify: true,
      isUnlimited: true,
      remaining: null,
      accessSource: "admin_limit",
    });
  });

  it("does not make Pro unlimited without an explicit CoS entitlement", () => {
    expect(resolveCosEntitlement({ subscriptionStatus: "pro", credits: 0 }, 1, TODAY)).toMatchObject({
      hasAccess: false,
      canVerify: false,
      isUnlimited: false,
      remaining: 0,
    });
  });

  it("adds purchased credits to a finite custom allowance and consumes credits first", () => {
    expect(
      resolveCosEntitlement(
        { verificationLimit: 5, totalVerificationsUsed: 2, credits: 3 },
        1,
        TODAY,
      ),
    ).toMatchObject({
      hasAccess: true,
      remaining: 6,
      consumptionSource: "credits",
    });
  });

  it("reports a finite custom limit exhausted after its usage is consumed", () => {
    expect(
      resolveCosEntitlement(
        { cosCheckApproved: true, verificationLimit: 2, totalVerificationsUsed: 2 },
        1,
        TODAY,
      ),
    ).toMatchObject({
      hasAccess: true,
      canVerify: false,
      remaining: 0,
      consumptionSource: "none",
    });
  });

  it("resets the displayed daily allowance on a new day", () => {
    expect(
      resolveCosEntitlement(
        {
          cosCheckApproved: true,
          dailyVerificationsUsed: 1,
          lastVerificationDate: "2026-09-14",
        },
        2,
        TODAY,
      ),
    ).toMatchObject({
      canVerify: true,
      remaining: 2,
      consumptionSource: "daily",
    });
  });

  it("keeps an approved user at zero when today's daily allowance is exhausted", () => {
    expect(
      resolveCosEntitlement(
        {
          cosCheckApproved: true,
          dailyVerificationsUsed: 1,
          lastVerificationDate: TODAY,
        },
        1,
        TODAY,
      ),
    ).toMatchObject({
      hasAccess: true,
      canVerify: false,
      remaining: 0,
    });
  });

  it("blocks a restricted user even when another grant is unlimited", () => {
    expect(
      resolveCosEntitlement(
        { isRestricted: true, verificationLimit: -1, cosCheckSubscription: true },
        -1,
        TODAY,
      ),
    ).toMatchObject({
      hasAccess: false,
      canVerify: false,
      isUnlimited: false,
      accessSource: "restricted",
    });
  });
});
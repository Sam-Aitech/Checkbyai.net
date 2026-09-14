import { describe, expect, it, vi } from 'vitest';
import {
  fulfillPaidCheckoutOnce,
  getCosCreditPackageGrant,
} from '../checkoutFulfillment';

describe('CoS credit package grants', () => {
  it('maps Starter and Pro to their advertised verification credits', () => {
    expect(getCosCreditPackageGrant('starter')).toBe(50);
    expect(getCosCreditPackageGrant('pro')).toBe(100);
  });

  it('does not treat unrelated products as CoS credit bundles', () => {
    expect(getCosCreditPackageGrant('alert_annual')).toBeNull();
    expect(getCosCreditPackageGrant('unlimited')).toBeNull();
    expect(getCosCreditPackageGrant(undefined)).toBeNull();
  });
});

describe('paid checkout fulfillment', () => {
  it.each([
    ['unpaid'],
    ['no_payment_required'],
    [null],
  ])('does not claim or grant a %s session', async (paymentStatus) => {
    const runInTransaction = vi.fn(async () => true);
    const claim = vi.fn(async () => true);
    const grant = vi.fn(async () => undefined);

    const fulfilled = await fulfillPaidCheckoutOnce({
      paymentStatus,
      runInTransaction,
      claim,
      grant,
    });

    expect(fulfilled).toBe(false);
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
  });

  it.each([
    ['starter', 50],
    ['pro', 100],
  ])('grants %s exactly once across webhook and success-page processing', async (packageType, expectedCredits) => {
    const claimedSessions = new Set<string>();
    let credits = 0;
    const sessionId = `checkout-${packageType}`;

    const processFromEitherPath = () => fulfillPaidCheckoutOnce({
      paymentStatus: 'paid',
      runInTransaction: async (work: (tx: { source: string }) => Promise<boolean>) => work({ source: 'test' }),
      claim: async () => {
        if (claimedSessions.has(sessionId)) return false;
        claimedSessions.add(sessionId);
        return true;
      },
      grant: async () => {
        credits += getCosCreditPackageGrant(packageType) ?? 0;
      },
    });

    expect(await processFromEitherPath()).toBe(true);
    expect(await processFromEitherPath()).toBe(false);
    expect(credits).toBe(expectedCredits);
  });

  it('does not retain the claim when the transaction rolls back after a grant failure', async () => {
    const committedClaims = new Set<string>();
    const sessionId = 'checkout-retry';
    let attempts = 0;

    const process = () => fulfillPaidCheckoutOnce({
      paymentStatus: 'paid',
      runInTransaction: async (work: (tx: Set<string>) => Promise<boolean>) => {
        const transactionalClaims = new Set(committedClaims);
        const result = await work(transactionalClaims);
        committedClaims.clear();
        transactionalClaims.forEach((id) => committedClaims.add(id));
        return result;
      },
      claim: async (tx) => {
        if (tx.has(sessionId)) return false;
        tx.add(sessionId);
        return true;
      },
      grant: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary grant failure');
      },
    });

    await expect(process()).rejects.toThrow('temporary grant failure');
    expect(committedClaims.has(sessionId)).toBe(false);
    await expect(process()).resolves.toBe(true);
    expect(committedClaims.has(sessionId)).toBe(true);
  });
});
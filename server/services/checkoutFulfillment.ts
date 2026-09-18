export type StripePaymentStatus = 'paid' | 'unpaid' | 'no_payment_required' | string | null | undefined;

const COS_CREDIT_PACKAGE_GRANTS: Readonly<Record<string, number>> = Object.freeze({
  starter: 50,
  pro: 100,
});

/**
 * Returns the one-time CoS verification-credit grant for a package, or null
 * when the package is not one of the credit bundles.
 */
export function getCosCreditPackageGrant(packageType: string | null | undefined): number | null {
  if (!packageType) return null;
  return COS_CREDIT_PACKAGE_GRANTS[packageType] ?? null;
}

interface FulfillPaidCheckoutOptions<TTransaction> {
  paymentStatus: StripePaymentStatus;
  runInTransaction: (work: (tx: TTransaction) => Promise<boolean>) => Promise<boolean>;
  claim: (tx: TTransaction) => Promise<boolean>;
  grant: (tx: TTransaction) => Promise<void>;
}

/**
 * Runs a checkout entitlement grant exactly once.
 *
 * The claim and grant share one transaction so a failed grant also rolls back
 * its claim. A webhook delivery and success-page verification can therefore
 * race safely: only the first committed claim applies the entitlement.
 */
export async function fulfillPaidCheckoutOnce<TTransaction>({
  paymentStatus,
  runInTransaction,
  claim,
  grant,
}: FulfillPaidCheckoutOptions<TTransaction>): Promise<boolean> {
  if (paymentStatus !== 'paid') return false;

  return runInTransaction(async (tx) => {
    if (!(await claim(tx))) return false;
    await grant(tx);
    return true;
  });
}
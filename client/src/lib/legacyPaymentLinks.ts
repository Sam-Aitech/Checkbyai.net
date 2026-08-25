// Hardcoded Stripe Payment Links for the legacy monthly Notification Engine
// plans, kept as-is per the pricing restructure decision to leave existing
// subscribers untouched. New plans (alert_annual, alert_annual_pro,
// cos_check_single) go through /api/checkout/credits instead — see
// usePackagePrices.ts — since that path doesn't need a hand-created Payment
// Link per price.
export const LEGACY_PAYMENT_LINKS: Record<string, string> = {
  notification_starter: 'https://buy.stripe.com/8x24gAb5g6JTglG5bZeZ204',
  notification_pro: 'https://buy.stripe.com/aFa00kflwd8h4CYcEreZ205',
};

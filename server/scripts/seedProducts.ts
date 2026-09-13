import Stripe from 'stripe';
import { logger } from '../utils/logger';

/**
 * Idempotent (search-by-name before create, safe to re-run). Uses
 * process.env.STRIPE_SECRET_KEY directly — the same credential every other
 * Stripe call in this app uses (server/routes/billing.ts) — rather than the
 * Replit-connector client this script used previously. If this Replit
 * deployment's connector points at a different Stripe account/mode than
 * STRIPE_SECRET_KEY, re-verify that before relying on this script.
 *
 * Covers every packageType that GET /api/checkout/credits + GET /api/packages
 * need live in Stripe for the dynamic-Checkout-Session flow (Alert Pass
 * annual plans + the single CoS check) to work — confirmed 2026-09-13 that
 * production's GET /api/packages was returning an empty packages array,
 * meaning these had never actually been created (or existed in the wrong
 * Stripe mode), which is why the Alert Pass cards showed "Coming soon" on
 * live pricing pages.
 *
 * Deliberately does NOT include notification_starter/notification_pro or the
 * legacy starter/pro/unlimited/master CoS packages that also sell through
 * hardcoded Stripe Payment Links (Pricing.tsx/CosPricing.tsx/
 * AlertAddOnModal.tsx's paymentLinks maps) — those Payment Links can't
 * function without their underlying product/price already existing, so if
 * their buttons already work live, the products already exist; re-running
 * this for them would risk a second, disconnected product next to the one
 * the live Payment Link actually points at. Also excludes `cos_check`
 * (admin-granted only, never created via checkout).
 */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover' as any,
});

interface Product {
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  metadata: {
    packageType: string;
    credits?: string;
  };
  recurring?: { interval: 'month' | 'year' };
}

const products: Product[] = [
  {
    name: 'Alert Pass (Annual)',
    description: 'Low-commitment sponsor-licence monitoring for a single employer. Monitor 1 company for 12 months, email + WhatsApp alerts, same-day (18:00 UTC), 30-day change history.',
    priceAmount: 999, // £9.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'alert_annual',
    },
    recurring: { interval: 'year' },
  },
  {
    name: 'Alert Pass Pro (Annual)',
    description: 'Full sponsor-licence protection, billed once a year. Monitor up to 5 companies for 12 months, email + WhatsApp + SMS, twice-daily alerts, 90-day change history, sponsored job alerts.',
    priceAmount: 1999, // £19.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'alert_annual_pro',
    },
    recurring: { interval: 'year' },
  },
  {
    name: 'CoS Check (Single)',
    description: 'One Certificate of Sponsorship authenticity check. One-time purchase, no subscription.',
    priceAmount: 499, // £4.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'cos_check_single',
      credits: '1',
    },
  },
];

async function seedProducts() {
  logger.info('Starting Stripe product seeding...');
  
  try {
    for (const productData of products) {
      const existingProducts = await stripeClient.products.search({
        query: `name:"${productData.name}"`,
      });

      if (existingProducts.data.length > 0) {
        logger.info(`Product "${productData.name}" already exists, skipping...`);
        continue;
      }

      const product = await stripeClient.products.create({
        name: productData.name,
        description: productData.description,
        metadata: productData.metadata,
      });

      logger.info(`Created product: ${product.id} - ${product.name}`);

      const priceData: any = {
        product: product.id,
        unit_amount: productData.priceAmount,
        currency: productData.currency,
        metadata: productData.metadata,
      };

      if (productData.recurring) {
        priceData.recurring = productData.recurring;
      }

      const price = await stripeClient.prices.create(priceData);
      logger.info(`Created price: ${price.id} - £${(productData.priceAmount / 100).toFixed(2)}`);
    }

    logger.info('Product seeding completed!');
    logger.info('To use these in your app, query the stripe.products and stripe.prices tables.');
  } catch (error) {
    logger.error({ err: error }, 'Error seeding products:');
    throw error;
  }
}

seedProducts().catch((err) => logger.error({ err }, 'seedProducts failed'));

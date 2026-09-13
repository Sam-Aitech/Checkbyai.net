import Stripe from 'stripe';
import { logger } from '../utils/logger';

/**
 * DEPRECATED / legacy-only. This only seeds the original 4 packageTypes
 * (starter, pro, unlimited, master). The 6 newer packageTypes actually live
 * in Stripe — notification_starter, notification_pro, alert_annual,
 * alert_annual_pro, cos_check, cos_check_single — were created manually via
 * the Stripe Dashboard and are NOT covered here. Do not extend this list to
 * "catch up" without first confirming in the Dashboard that you won't create
 * duplicate/conflicting products next to the ones GET /api/packages already
 * serves live traffic from.
 *
 * Also uses process.env.STRIPE_SECRET_KEY directly (same credential every
 * other Stripe call in this app uses — server/routes/billing.ts) rather than
 * the Replit-connector client this script used previously. If this Replit
 * deployment's connector points at a different Stripe account/mode than
 * STRIPE_SECRET_KEY, re-verify that before relying on this script.
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
    name: 'Starter Package',
    description: '50 verification credits for occasional use. One-time purchase, credits never expire.',
    priceAmount: 2499, // £24.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'starter',
      credits: '50',
    },
  },
  {
    name: 'Pro Package',
    description: '100 verification credits — best value. One-time purchase, credits never expire.',
    priceAmount: 3999, // £39.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'pro',
      credits: '100',
    },
  },
  {
    name: 'Unlimited Monthly',
    description: 'Unlimited verifications for businesses. One-time purchase, no recurring charge.',
    priceAmount: 9999, // £99.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'unlimited',
    },
  },
  {
    name: 'Master Package - Expert Review',
    description: 'Priority expert human review with 24-hour SLA and detailed analysis report',
    priceAmount: 9999, // £99.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'master',
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

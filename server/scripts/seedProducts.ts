import Stripe from 'stripe';
import { logger } from '../utils/logger';

/**
 * Seeds the three Stripe products whose UI checkout buttons depend on
 * GET /api/packages. Product and price metadata are the stable identifiers;
 * rerunning this script does not create duplicates.
 */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover' as any,
});

interface ProductSeed {
  name: string;
  description: string;
  priceAmount: number;
  metadata: Record<string, string>;
  recurring?: { interval: 'month' | 'year' };
}

const products: ProductSeed[] = [
  {
    name: 'Alert Pass (Annual)',
    description: 'Monitor one company for 12 months with email and WhatsApp alerts.',
    priceAmount: 999,
    metadata: {
      packageType: 'alert_annual',
      companies: '1',
    },
    recurring: { interval: 'year' },
  },
  {
    name: 'Alert Pass Pro (Annual)',
    description: 'Monitor up to five companies for 12 months with twice-daily alerts.',
    priceAmount: 1999,
    metadata: {
      packageType: 'alert_annual_pro',
      companies: '5',
    },
    recurring: { interval: 'year' },
  },
  {
    name: 'CoS Check (single)',
    description: 'One AI-powered Certificate of Sponsorship document verification.',
    priceAmount: 499,
    metadata: {
      packageType: 'cos_check_single',
      credits: '1',
    },
  },
];

function priceMatches(price: Stripe.Price, seed: ProductSeed): boolean {
  return (
    price.active &&
    price.unit_amount === seed.priceAmount &&
    price.currency === 'gbp' &&
    (price.recurring?.interval ?? null) === (seed.recurring?.interval ?? null)
  );
}

async function seedProducts() {
  logger.info('Starting Stripe product seeding...');

  const existingProducts = await stripeClient.products.list({
    active: true,
    limit: 100,
  });

  for (const productData of products) {
    let product = existingProducts.data.find(
      (candidate) =>
        candidate.metadata?.packageType === productData.metadata.packageType,
    );

    if (!product) {
      product = await stripeClient.products.create({
        name: productData.name,
        description: productData.description,
        metadata: productData.metadata,
      });
      logger.info(`Created product: ${product.id} - ${product.name}`);
    } else {
      logger.info(`Product "${product.name}" already exists, checking price...`);
    }

    const existingPrices = await stripeClient.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });

    if (existingPrices.data.some((price) => priceMatches(price, productData))) {
      logger.info(`Matching price for "${product.name}" already exists, skipping...`);
      continue;
    }

    const price = await stripeClient.prices.create({
      product: product.id,
      unit_amount: productData.priceAmount,
      currency: 'gbp',
      metadata: productData.metadata,
      ...(productData.recurring ? { recurring: productData.recurring } : {}),
    });
    logger.info(`Created price: ${price.id} - £${(productData.priceAmount / 100).toFixed(2)}`);
  }

  logger.info('Stripe product seeding completed.');
}

seedProducts().catch((err) => {
  logger.error({ err }, 'seedProducts failed');
  process.exitCode = 1;
});

import { getUncachableStripeClient } from '../stripeClient';

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
    description: '50 verification credits for CoS document analysis',
    priceAmount: 2499, // £24.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'starter',
      credits: '50',
    },
  },
  {
    name: 'Pro Package',
    description: '100 verification credits for CoS document analysis',
    priceAmount: 3999, // £39.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'pro',
      credits: '100',
    },
  },
  {
    name: 'Unlimited Monthly',
    description: 'Unlimited verifications per month - perfect for businesses',
    priceAmount: 9999, // £99.99 in pence
    currency: 'gbp',
    metadata: {
      packageType: 'unlimited',
    },
    recurring: { interval: 'month' },
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
  console.log('Starting Stripe product seeding...');
  
  try {
    const stripe = await getUncachableStripeClient();
    
    for (const productData of products) {
      const existingProducts = await stripe.products.search({
        query: `name:"${productData.name}"`,
      });

      if (existingProducts.data.length > 0) {
        console.log(`Product "${productData.name}" already exists, skipping...`);
        continue;
      }

      const product = await stripe.products.create({
        name: productData.name,
        description: productData.description,
        metadata: productData.metadata,
      });

      console.log(`Created product: ${product.id} - ${product.name}`);

      const priceData: any = {
        product: product.id,
        unit_amount: productData.priceAmount,
        currency: productData.currency,
        metadata: productData.metadata,
      };

      if (productData.recurring) {
        priceData.recurring = productData.recurring;
      }

      const price = await stripe.prices.create(priceData);
      console.log(`Created price: ${price.id} - £${(productData.priceAmount / 100).toFixed(2)}`);
    }

    console.log('\nProduct seeding completed!');
    console.log('\nTo use these in your app, query the stripe.products and stripe.prices tables.');
  } catch (error) {
    console.error('Error seeding products:', error);
    throw error;
  }
}

seedProducts().catch(console.error);

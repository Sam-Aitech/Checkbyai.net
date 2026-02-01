import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const userId = session.metadata?.userId;
    const packageType = session.metadata?.packageType;
    
    if (!userId || !packageType) {
      console.error('Missing userId or packageType in session metadata');
      return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.error('User not found:', userId);
      return;
    }

    switch (packageType) {
      case 'starter':
        await storage.addCredits(userId, 50);
        console.log(`Added 50 credits to user ${userId}`);
        break;
      case 'pro':
        await storage.addCredits(userId, 100);
        console.log(`Added 100 credits to user ${userId}`);
        break;
      case 'unlimited':
        await storage.updateUserSubscription(userId, {
          subscriptionStatus: 'pro',
          stripeSubscriptionId: session.subscription,
          stripeCustomerId: session.customer,
        });
        console.log(`Activated unlimited subscription for user ${userId}`);
        break;
      case 'master':
        console.log(`Master package purchased by user ${userId} - creating expert request`);
        break;
    }

    if (session.customer && !user.stripeCustomerId) {
      await storage.updateUserStripeCustomer(userId, session.customer);
    }
  }

  static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error('No user found for Stripe customer:', customerId);
      return;
    }

    const status = subscription.status;
    if (status === 'active' || status === 'trialing') {
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: 'pro',
        stripeSubscriptionId: subscription.id,
      });
    } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: 'free',
        stripeSubscriptionId: null,
      });
    }
  }

  static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) return;

    await storage.updateUserSubscription(user.id, {
      subscriptionStatus: 'free',
      stripeSubscriptionId: null,
    });
  }
}

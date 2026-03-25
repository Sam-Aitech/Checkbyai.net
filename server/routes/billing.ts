import type { Express } from "express";
import * as crypto from "crypto";
import Stripe from "stripe";
import { db } from "../db";
import { sql, eq, lt } from "drizzle-orm";
import { withRetry } from "../utils/dbRetry";
import { users, processedCheckouts } from "@shared/schema";
import { sendEmailReliably } from "../utils/resilientEmail";
import { getAppUrl } from "../utils/appUrl";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";

const CHECKOUT_HMAC_SECRET = process.env.CHECKOUT_HMAC_SECRET || process.env.SESSION_SECRET || process.env.STRIPE_SECRET_KEY!;

function signClientReferenceId(userId: string, packageType: string, companyName?: string): string {
  const encodedCompany = companyName ? encodeURIComponent(companyName) : '';
  const payload = encodedCompany
    ? `${userId}::${packageType}::${encodedCompany}`
    : `${userId}::${packageType}`;
  const hmac = crypto.createHmac('sha256', CHECKOUT_HMAC_SECRET).update(payload).digest('hex').slice(0, 16);
  return `${payload}::${hmac}`;
}

function verifyClientReferenceId(clientRefId: string): { userId: string; packageType: string; companyName?: string } | null {
  try {
    const parts = clientRefId.split('::');
    let userId: string, packageType: string, signature: string, encodedCompany: string | undefined;

    if (parts.length === 3) {
      // Legacy format: userId::packageType::hmac16
      [userId, packageType, signature] = parts;
    } else if (parts.length === 4) {
      // Extended format: userId::packageType::encodedCompany::hmac16
      [userId, packageType, encodedCompany, signature] = parts;
    } else {
      return null;
    }

    if (!userId || !packageType || !signature || signature.length !== 16) return null;
    const payload = encodedCompany ? `${userId}::${packageType}::${encodedCompany}` : `${userId}::${packageType}`;
    const expected = crypto.createHmac('sha256', CHECKOUT_HMAC_SECRET).update(payload).digest('hex').slice(0, 16);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return {
      userId,
      packageType,
      ...(encodedCompany ? { companyName: decodeURIComponent(encodedCompany) } : {}),
    };
  } catch {
    return null;
  }
}

async function markSessionProcessed(sessionId: string): Promise<void> {
  await db.insert(processedCheckouts).values({ sessionId }).onConflictDoNothing();
}

async function isSessionProcessed(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: processedCheckouts.sessionId })
    .from(processedCheckouts)
    .where(eq(processedCheckouts.sessionId, sessionId));
  return !!row;
}

export async function cleanupOldProcessedCheckouts(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await db.delete(processedCheckouts).where(lt(processedCheckouts.processedAt, cutoff));
}

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-11-17.clover" as any,
});

async function sendSubscriptionNotifications(
  userId: string,
  planName: string,
  packageType: string,
  sessionEmail?: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey) return;

  let userEmail = sessionEmail;
  if (!userEmail) {
    try {
      const user = await storage.getUser(userId);
      userEmail = user?.email ?? undefined;
    } catch (err) {
      console.error('[Subscription] Failed to fetch user email for notifications:', err);
    }
  }

  const planDetails: Record<string, { credits: string; watches: string; timing: string; portal: string }> = {
    starter:              { credits: "50 CoS checks",          watches: "—",             timing: "—",           portal: "/verify" },
    pro:                  { credits: "100 CoS checks",         watches: "—",             timing: "—",           portal: "/verify" },
    unlimited:            { credits: "Unlimited CoS checks",   watches: "10 companies",  timing: "Immediate",   portal: "/verify" },
    notification_starter: { credits: "—",                      watches: "2 companies",   timing: "Same-day",    portal: "/sponsor-monitor" },
    notification_pro:     { credits: "5 CoS checks/month",     watches: "5 companies",   timing: "Immediate",   portal: "/sponsor-monitor" },
  };
  const details = planDetails[packageType] || { credits: "—", watches: "—", timing: "—", portal: "/" };

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; New Subscriber</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Plan</td><td style="padding:8px 12px;color:#1d4ed8;font-weight:bold;border-bottom:1px solid #f0f0f0;">${planName}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Package Type</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #f0f0f0;">${packageType}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">User Email</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #f0f0f0;">${userEmail || "unknown"}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">User ID</td><td style="padding:8px 12px;color:#999;font-family:monospace;font-size:12px;border-bottom:1px solid #f0f0f0;">${userId}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;">Timestamp</td><td style="padding:8px 12px;color:#333;">${new Date().toISOString()}</td></tr>
        </table>
      </div>
    </div>`;

  const userHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#10004; You're all set — ${planName}</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#333;font-size:15px;margin-top:0;">Thank you for subscribing! Here's what's now unlocked on your account:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          ${details.credits !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#9989; Checks</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.credits}</td></tr>` : ""}
          ${details.watches !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#128064; Watch list</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.watches}</td></tr>` : ""}
          ${details.timing !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#9889; Alert speed</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.timing}</td></tr>` : ""}
        </table>
        <div style="text-align:center;">
          <a href="${getAppUrl()}${details.portal}" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Get Started</a>
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? Reply to this email or visit checkbyai.net</p>
      </div>
    </div>`;

  const sends: Promise<boolean>[] = [];

  if (adminEmail) {
    sends.push(
      sendEmailReliably(
        { from: "CheckByAI <alerts@checkbyai.net>", to: [adminEmail], subject: `New subscriber: ${planName} — ${userEmail || userId}`, html: adminHtml },
        "[Subscription:Admin]",
      ),
    );
  }

  if (userEmail) {
    sends.push(
      sendEmailReliably(
        { from: "CheckByAI <no-reply@checkbyai.net>", to: [userEmail], subject: `Welcome to ${planName} — you're all set`, html: userHtml },
        "[Subscription:User]",
      ),
    );
  }

  const results = await Promise.all(sends);
  const allSent = results.every(Boolean);
  console.log(`[Subscription] Emails for ${packageType} — user: ${userEmail || userId} — ${allSent ? "all sent" : "some failed"}`);
}

export function registerBillingRoutes(app: Express): void {
  app.post('/api/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (subscription.status === 'active') {
          return res.json({
            subscriptionId: subscription.id,
            status: 'active'
          });
        }
      }

      if (!user.email) {
        return res.status(400).json({ message: 'No user email on file' });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        });
        await storage.updateUserStripeInfo(userId, customer.id);
        customerId = customer.id;
      }

      const allPrices = await stripe.prices.list({ active: true, limit: 50, expand: ['data.product'] });
      const unlimitedPrice = allPrices.data.find(p => {
        const prod = p.product as any;
        return prod?.metadata?.packageType === 'unlimited' && p.recurring;
      });

      if (!unlimitedPrice) {
        return res.status(400).json({
          message: 'Unlimited subscription plan not configured in Stripe. Please use the checkout flow instead.',
          redirect: '/pricing'
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: unlimitedPrice.id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: { userId, packageType: 'unlimited' },
      });

      res.json({ url: session.url, status: 'redirect' });
    } catch (error: unknown) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ message: 'Failed to create subscription' });
    }
  });

  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('Webhook error: rawBody not available — ensure express.json verify callback is configured');
        return res.status(400).send('Webhook raw body unavailable');
      }
      event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: unknown) {
      console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err);
      return res.status(400).send('Webhook signature verification failed');
    }

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;

        if (customerId) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const subPkgType = subscription.metadata?.packageType;
            const prevStatus = user.subscriptionStatus || 'free';
            if (subscription.status === 'active') {
              if (subPkgType === 'cos_check') {
                await storage.updateCosCheckSubscription(user.id, true);
              } else {
                const subStatus = subPkgType === 'starter' ? 'starter' : subPkgType === 'pro' ? 'pro' : 'unlimited';
                await storage.updateUserSubscription(user.id, {
                  subscriptionStatus: subStatus,
                  stripeSubscriptionId: subscription.id,
                  stripeCustomerId: customerId,
                });
                storage.logSubscriptionChange({
                  userId: user.id,
                  changedBy: 'stripe',
                  source: 'stripe_webhook',
                  previousStatus: prevStatus,
                  newStatus: subStatus,
                  reason: `Stripe subscription active (${event.type})`,
                  metadata: { stripeEventId: event.id, subscriptionId: subscription.id, packageType: subPkgType },
                }).catch(() => {});
              }
            } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || event.type === 'customer.subscription.deleted') {
              if (subPkgType === 'cos_check') {
                await storage.updateCosCheckSubscription(user.id, false);
              } else {
                await storage.updateUserSubscription(user.id, {
                  subscriptionStatus: 'free',
                  stripeSubscriptionId: null,
                });
                storage.logSubscriptionChange({
                  userId: user.id,
                  changedBy: 'stripe',
                  source: 'stripe_webhook',
                  previousStatus: prevStatus,
                  newStatus: 'free',
                  reason: `Stripe subscription ${subscription.status} (${event.type})`,
                  metadata: { stripeEventId: event.id, subscriptionId: subscription.id, packageType: subPkgType },
                }).catch(() => {});
              }
            }
          }
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId && invoice.subscription) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            if (user.subscriptionStatus && user.subscriptionStatus !== 'free') {
              await storage.updateUserSubscription(user.id, {
                subscriptionStatus: user.subscriptionStatus,
                stripeSubscriptionId: invoice.subscription,
                stripeCustomerId: customerId,
              });

              // ── Phase 3A: Monthly credit top-up for notification_pro renewals ──
              // notification_pro grants 5 CoS credits per billing cycle.
              // Only fires on renewal invoices (billing_reason='subscription_cycle'), not the first payment.
              const billingReason = invoice.billing_reason;
              const subMeta = (invoice.lines?.data?.[0]?.metadata ?? {}) as Record<string, string>;
              const linePackageType = subMeta.packageType;
              const isNotifPro = linePackageType === 'notification_pro' || user.subscriptionStatus === 'pro';
              if (isNotifPro && billingReason === 'subscription_cycle') {
                await storage.addCredits(user.id, 5);
                storage.logSubscriptionChange({
                  userId: user.id,
                  changedBy: 'stripe',
                  source: 'stripe_webhook',
                  previousStatus: user.subscriptionStatus,
                  newStatus: user.subscriptionStatus,
                  reason: 'Monthly notification_pro credit top-up (+5 credits)',
                  metadata: { stripeEventId: event.id, invoiceId: invoice.id, creditsAdded: 5 },
                }).catch(() => {});
                console.log(`[Billing] Added 5 monthly credits to notification_pro user ${user.id}`);
              }
            }
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const prevStatus = user.subscriptionStatus || 'free';
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: 'past_due',
            });
            storage.logSubscriptionChange({
              userId: user.id,
              changedBy: 'stripe',
              source: 'stripe_webhook',
              previousStatus: prevStatus,
              newStatus: 'past_due',
              reason: 'Stripe invoice payment failed',
              metadata: { stripeEventId: event.id, invoiceId: invoice.id },
            }).catch(() => {});
          }
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        let userId = session.metadata?.userId;
        let packageType = session.metadata?.packageType;

        if (!userId && session.client_reference_id) {
          const verified = verifyClientReferenceId(session.client_reference_id);
          if (verified) {
            userId = verified.userId;
            packageType = verified.packageType;
          } else {
            console.error('Invalid client_reference_id signature:', session.client_reference_id);
          }
        }

        if (userId && packageType && session.payment_status === 'paid' && !(await isSessionProcessed(session.id))) {
          await markSessionProcessed(session.id);
          const sessionEmail = session.customer_details?.email || session.customer_email || undefined;
          const prevUser = await storage.getUser(userId);
          const prevStatus = prevUser?.subscriptionStatus || 'free';
          if (packageType === 'starter') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 50`,
                subscriptionStatus: 'starter',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-starter');
            sendSubscriptionNotifications(userId, 'CoS Check Starter', 'starter', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
            storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'starter', reason: 'Checkout: CoS Check Starter', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch(() => {});
          } else if (packageType === 'pro') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 100`,
                subscriptionStatus: 'pro',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-pro');
            sendSubscriptionNotifications(userId, 'CoS Check Pro', 'pro', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
            storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'pro', reason: 'Checkout: CoS Check Pro', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch(() => {});
          } else if (packageType === 'unlimited') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                subscriptionStatus: 'unlimited',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-unlimited');
            sendSubscriptionNotifications(userId, 'CoS Check Unlimited', 'unlimited', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
            storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'unlimited', reason: 'Checkout: CoS Check Unlimited', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch(() => {});
          } else if (packageType === 'master') {
            await storage.createPaidSubmission({
              email: session.customer_details?.email || '',
              packageType: 'full',
              paymentStatus: 'paid',
              stripeSessionId: session.id,
              priority: true,
              phoneConsultationRequested: true,
            });
          } else if (packageType === 'notification_starter') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                subscriptionStatus: 'starter',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-notification-starter');
            sendSubscriptionNotifications(userId, 'Notification Engine Starter', 'notification_starter', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
            storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'starter', reason: 'Checkout: Sponsor Monitor Starter', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch(() => {});
          } else if (packageType === 'notification_pro') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 5`,
                subscriptionStatus: 'pro',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-notification-pro');
            sendSubscriptionNotifications(userId, 'Notification Engine Pro', 'notification_pro', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
            storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'pro', reason: 'Checkout: Sponsor Monitor Pro', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch(() => {});
          } else if (packageType === 'cos_check') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                cosCheckSubscription: true,
                cosCheckApproved: true,
                ipExempt: true,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-cos-check');
            sendSubscriptionNotifications(userId, 'COS Check Subscription', 'cos_check', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          }
        }
        break;
      }
    }

    res.json({ received: true });
  });

  app.get('/api/packages', async (req, res) => {
    try {
      const products = await stripe.products.list({ active: true, limit: 20 });
      const prices = await stripe.prices.list({ active: true, limit: 50 });

      const productsMap = new Map();
      for (const product of products.data) {
        const productPrices = prices.data
          .filter(p => p.product === product.id)
          .map(p => ({
            id: p.id,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
            metadata: p.metadata,
          }));

        if (productPrices.length > 0) {
          productsMap.set(product.id, {
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: product.metadata,
            prices: productPrices,
          });
        }
      }

      res.json({ packages: Array.from(productsMap.values()) });
    } catch (error: unknown) {
      console.error('Error fetching packages:', error);
      res.status(500).json({ message: 'Failed to fetch packages' });
    }
  });

  app.post('/api/checkout/sign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { packageType, companyName } = req.body;
      const validTypes = ['starter', 'pro', 'unlimited', 'master', 'notification_starter', 'notification_pro'];
      if (!packageType || !validTypes.includes(packageType)) {
        return res.status(400).json({ message: 'Invalid package type' });
      }
      const clientReferenceId = signClientReferenceId(userId, packageType, companyName || undefined);
      res.json({ clientReferenceId });
    } catch (error: unknown) {
      console.error('Sign checkout error:', error);
      res.status(500).json({ message: 'Failed to prepare checkout' });
    }
  });

  app.post('/api/checkout/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { priceId, packageType } = req.body;

      if (!priceId || !packageType) {
        return res.status(400).json({ message: 'Missing priceId or packageType' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (!user.email) {
        return res.status(400).json({ message: 'Email required for checkout' });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId },
        });
        await storage.updateUserStripeCustomer(userId, customer.id);
        customerId = customer.id;
      }

      const isSubscription = packageType === 'unlimited';
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: isSubscription ? 'subscription' : 'payment',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: {
          userId,
          packageType,
        },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: unknown) {
      console.error('Checkout error:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  app.get('/api/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const credits = await storage.getCredits(userId);
      const user = await storage.getUser(userId);

      res.json({
        credits,
        subscriptionStatus: user?.subscriptionStatus || 'free',
        isUnlimited: user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise' || user?.verificationLimit === -1
      });
    } catch (error: unknown) {
      console.error('Error fetching credits:', error);
      res.status(500).json({ message: 'Failed to fetch credits' });
    }
  });

  app.get('/api/checkout/verify/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        let packageType = session.metadata?.packageType;
        let sessionUserId = session.metadata?.userId;
        let companyName: string | undefined;

        if (!sessionUserId && session.client_reference_id) {
          const verified = verifyClientReferenceId(session.client_reference_id);
          if (verified && verified.userId === req.user.id) {
            sessionUserId = verified.userId;
            packageType = verified.packageType;
            companyName = verified.companyName;
          }
        }

        if (sessionUserId && sessionUserId === req.user.id) {
          if (!(await isSessionProcessed(sessionId))) {
            await markSessionProcessed(sessionId);
            if (packageType === 'starter') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 50`,
                  subscriptionStatus: 'starter',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-starter');
            } else if (packageType === 'pro') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 100`,
                  subscriptionStatus: 'pro',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-pro');
            } else if (packageType === 'unlimited') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  subscriptionStatus: 'unlimited',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-unlimited');
            } else if (packageType === 'master') {
              await storage.createPaidSubmission({
                email: session.customer_details?.email || req.user.email || '',
                packageType: 'full',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                priority: true,
                phoneConsultationRequested: true,
              });
            } else if (packageType === 'notification_starter') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  subscriptionStatus: 'starter',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-notification-starter');
            } else if (packageType === 'notification_pro') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 5`,
                  subscriptionStatus: 'pro',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-notification-pro');
            }
          }

          const credits = await storage.getCredits(sessionUserId);
          const user = await storage.getUser(sessionUserId);

          res.json({
            success: true,
            packageType,
            credits,
            subscriptionStatus: user?.subscriptionStatus,
            ...(companyName ? { companyName } : {}),
          });
        } else {
          res.status(403).json({ message: 'Session does not belong to this user' });
        }
      } else {
        res.json({ success: false, status: session.payment_status });
      }
    } catch (error: unknown) {
      console.error('Verify checkout error:', error);
      res.status(500).json({ message: 'Failed to verify checkout' });
    }
  });

  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('../stripeClient');
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: unknown) {
      console.error('Error getting publishable key:', error);
      res.status(500).json({ message: 'Failed to get Stripe key' });
    }
  });
}

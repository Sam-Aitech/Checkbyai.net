import type { Express } from "express";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import Stripe from "stripe";
import { db } from "../db";
import { sql, eq, lt, and, inArray } from "drizzle-orm";
import { withRetry } from "../utils/dbRetry";
import { users, processedCheckouts, companyWatches, sponsorCanonical, DEFAULT_NOTIF_PREFS } from "@shared/schema";
import { sendEmailReliably } from "../utils/resilientEmail";
import { getAppUrl } from "../utils/appUrl";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { getWatchLimit } from "../utils/tierConfig";
import { normalizeName, generateFingerprint } from "../utils/sponsorListFetcher";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";

/**
 * Best-effort: after a successful Notification Engine checkout, auto-create
 * a company_watches row for the company the user pre-selected on the sponsor
 * page. Idempotent (no-op if a watch already exists or limit is reached) and
 * never throws — failures are logged but never break the checkout flow.
 */
async function autoCreateWatchFromPayment(userId: string, companyName: string): Promise<void> {
  try {
    const trimmed = companyName.trim();
    if (!trimmed) return;

    const normalized = normalizeName(trimmed);

    // Skip if user already has any watch (active or inactive) for this name
    const existing = await db
      .select({ id: companyWatches.id, isActive: companyWatches.isActive })
      .from(companyWatches)
      .where(and(
        eq(companyWatches.userId, userId),
        eq(companyWatches.organisationNameNormalized, normalized),
      ))
      .limit(1);
    if (existing.length > 0) {
      if (!existing[0].isActive) {
        await db.update(companyWatches)
          .set({ isActive: true })
          .where(eq(companyWatches.id, existing[0].id));
        logger.info({ userId, companyName: trimmed }, '[AutoWatch] Reactivated existing watch after payment');
      } else {
        logger.info({ userId, companyName: trimmed }, '[AutoWatch] Watch already active, skipping');
      }
      return;
    }

    // Resolve the canonical sponsor — fingerprint first, then normalized scan
    type CanonicalRow = typeof sponsorCanonical.$inferSelect;
    const fp = generateFingerprint(trimmed, '', '');
    let match: CanonicalRow | null = (await db.select().from(sponsorCanonical)
      .where(eq(sponsorCanonical.fingerprint, fp)).limit(1))[0] ?? null;

    if (!match) {
      const candidates = await db.select().from(sponsorCanonical)
        .where(inArray(sponsorCanonical.status, ['ACTIVE', 'NEWLY_GRANTED', 'REMOVED_REVOKED', 'GRACE_PERIOD']));
      match = candidates.find(c => normalizeName(c.currentName) === normalized) ?? null;
    }

    if (!match) {
      logger.warn({ userId, companyName: trimmed }, '[AutoWatch] Company not found in sponsor register; skipping auto-watch');
      return;
    }

    // Respect the user's tier watch limit (defensive — usually first watch)
    const user = await storage.getUser(userId);
    const limit = getWatchLimit(user?.subscriptionStatus);
    if (limit !== -1) {
      const active = await db.select({ id: companyWatches.id }).from(companyWatches)
        .where(and(eq(companyWatches.userId, userId), eq(companyWatches.isActive, true)));
      if (active.length >= limit) {
        logger.warn({ userId, limit, current: active.length }, '[AutoWatch] Watch limit reached, skipping');
        return;
      }
    }

    await db.insert(companyWatches).values({
      userId,
      organisationName: match.currentName,
      organisationNameNormalized: normalized,
      townCity: match.townCity,
      fingerprint: match.fingerprint,
      isActive: true,
    });
    logger.info({ userId, companyName: match.currentName, fingerprint: match.fingerprint }, '[AutoWatch] Created watch from checkout companyName');
  } catch (err) {
    logger.error({ err, userId, companyName }, '[AutoWatch] Failed to auto-create watch from payment — non-fatal');
  }
}

/**
 * alert_annual/alert_annual_pro are billed once a year but modeled as a Stripe
 * subscription so the existing customer.subscription.deleted webhook can
 * auto-downgrade the user back to free at expiry, without a separate cron job.
 * Checkout's subscription_data has no cancel_at field, so this sets it (plus
 * packageType metadata, needed by the update/deleted webhook branch) via a
 * follow-up Subscriptions API call once the subscription id is known.
 * Best-effort — failures are logged but never break the checkout flow.
 */
async function scheduleAnnualPassExpiry(subscriptionId: string | null | undefined, userId: string, packageType: string): Promise<void> {
  if (!subscriptionId) return;
  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      metadata: { userId, packageType },
    });
  } catch (err) {
    logger.error({ err, subscriptionId, userId, packageType }, '[AnnualPass] Failed to schedule expiry — non-fatal');
  }
}

/** Maps a Stripe subscription's packageType metadata to the subscriptionStatus it grants. */
function subStatusForSubscriptionPackage(subPkgType: string | undefined): 'starter' | 'pro' | 'unlimited' {
  if (subPkgType === 'starter' || subPkgType === 'alert_annual') return 'starter';
  if (subPkgType === 'pro' || subPkgType === 'alert_annual_pro') return 'pro';
  return 'unlimited';
}

const CHECKOUT_HMAC_SECRET = process.env.CHECKOUT_HMAC_SECRET;
if (!CHECKOUT_HMAC_SECRET) {
  throw new Error("CHECKOUT_HMAC_SECRET is required");
}
const hmacSecret = CHECKOUT_HMAC_SECRET;

function signClientReferenceId(userId: string, packageType: string, companyName?: string): string {
  const encodedCompany = companyName ? encodeURIComponent(companyName) : '';
  const payload = encodedCompany
    ? `${userId}::${packageType}::${encodedCompany}`
    : `${userId}::${packageType}`;
    const hmac = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex').slice(0, 16);
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
    const expected = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex').slice(0, 16);
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

// The transaction-scoped executor `db.transaction(async (tx) => ...)` hands its
// callback — same query-builder surface as `db` itself, just bound to one tx.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Claims a checkout session for processing. Pass a transaction executor so the
 * claim commits or rolls back atomically with the credit/subscription grant it
 * gates — claiming via the bare `db` executor ahead of a *separate* grant
 * transaction is what let a mid-grant failure leave a session "claimed" with
 * no credits ever granted: Stripe's retry then saw the claim, skipped the
 * grant, and returned 200, silently swallowing the failure.
 */
async function tryClaimSession(sessionId: string, executor: DbOrTx = db): Promise<boolean> {
  const result = await executor.execute(
    sql`INSERT INTO processed_checkouts (session_id) VALUES (${sessionId}) ON CONFLICT (session_id) DO NOTHING RETURNING id`
  );
  return (result as any).rowCount > 0;
}

async function isSessionProcessed(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: processedCheckouts.sessionId })
    .from(processedCheckouts)
    .where(eq(processedCheckouts.sessionId, sessionId));
  return !!row;
}

/**
 * Applies the entitlement grant for one packageType, run inside the caller's
 * claim transaction. Shared by the checkout.session.completed webhook and
 * GET /api/checkout/verify/:sessionId — both grant the same packageTypes from
 * a paid Stripe Checkout Session, differing only in where userId/session come
 * from (webhook metadata vs. signed client_reference_id).
 */
async function applyPackageGrant(
  tx: DbOrTx,
  userId: string,
  packageType: string | undefined,
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null,
): Promise<void> {
  const base = { stripeSubscriptionId, stripeCustomerId, updatedAt: new Date() };
  const withNotifPrefs = { notifPrefs: sql`COALESCE(${users.notifPrefs}, ${JSON.stringify(DEFAULT_NOTIF_PREFS)}::jsonb)` };

  if (packageType === 'starter') {
    await tx.update(users).set({ ...base, credits: sql`COALESCE(${users.credits}, 0) + 50`, subscriptionStatus: 'starter' }).where(eq(users.id, userId));
  } else if (packageType === 'pro') {
    await tx.update(users).set({ ...base, credits: sql`COALESCE(${users.credits}, 0) + 100`, subscriptionStatus: 'pro' }).where(eq(users.id, userId));
  } else if (packageType === 'unlimited') {
    await tx.update(users).set({ ...base, subscriptionStatus: 'unlimited' }).where(eq(users.id, userId));
  } else if (packageType === 'notification_starter') {
    await tx.update(users).set({ ...base, ...withNotifPrefs, subscriptionStatus: 'starter' }).where(eq(users.id, userId));
  } else if (packageType === 'notification_pro') {
    await tx.update(users).set({ ...base, ...withNotifPrefs, credits: sql`COALESCE(${users.credits}, 0) + 5`, subscriptionStatus: 'pro' }).where(eq(users.id, userId));
  } else if (packageType === 'alert_annual') {
    await tx.update(users).set({ ...base, ...withNotifPrefs, subscriptionStatus: 'starter' }).where(eq(users.id, userId));
  } else if (packageType === 'alert_annual_pro') {
    await tx.update(users).set({ ...base, ...withNotifPrefs, subscriptionStatus: 'pro' }).where(eq(users.id, userId));
  } else if (packageType === 'cos_check_single') {
    await tx.update(users).set({ credits: sql`COALESCE(${users.credits}, 0) + 1`, stripeCustomerId, updatedAt: new Date() }).where(eq(users.id, userId));
  } else if (packageType === 'cos_check') {
    await tx.update(users).set({ cosCheckSubscription: true, cosCheckApproved: true, ipExempt: true, stripeCustomerId, updatedAt: new Date() }).where(eq(users.id, userId));
  }
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
  apiVersion: "2025-11-17.clover",
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
      logger.error({ err }, '[Subscription] Failed to fetch user email for notifications');
    }
  }

  const planDetails: Record<string, { credits: string; watches: string; timing: string; portal: string }> = {
    starter:              { credits: "50 CoS checks",          watches: "—",             timing: "—",           portal: "/verify" },
    pro:                  { credits: "100 CoS checks",         watches: "—",             timing: "—",           portal: "/verify" },
    unlimited:            { credits: "Unlimited CoS checks",   watches: "10 companies",  timing: "Immediate",   portal: "/verify" },
    notification_starter: { credits: "—",                      watches: "2 companies",   timing: "Same-day",    portal: "/sponsor-monitor" },
    notification_pro:     { credits: "5 CoS checks/month",     watches: "5 companies",   timing: "Immediate",   portal: "/sponsor-monitor" },
    alert_annual:         { credits: "—",                      watches: "1 company/yr",  timing: "Same-day",    portal: "/sponsor-monitor" },
    alert_annual_pro:     { credits: "—",                      watches: "5 companies/yr",timing: "Immediate",   portal: "/sponsor-monitor" },
    cos_check_single:     { credits: "1 CoS check",             watches: "—",             timing: "—",           portal: "/verify" },
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
        <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#10004; You're all set: ${planName}</h1>
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
        { from: "CheckByAI <alerts@checkbyai.net>", to: [adminEmail], subject: `New subscriber: ${planName} (${userEmail || userId})`, html: adminHtml },
        "[Subscription:Admin]",
      ),
    );
  }

  if (userEmail) {
    sends.push(
      sendEmailReliably(
        { from: "CheckByAI <no-reply@checkbyai.net>", to: [userEmail], subject: `Welcome to ${planName}, you're all set`, html: userHtml },
        "[Subscription:User]",
      ),
    );
  }

  const results = await Promise.all(sends);
  const allSent = results.every(Boolean);
  logger.info({ packageType, user: userEmail || userId, allSent }, `[Subscription] Emails for ${packageType} — user: ${userEmail || userId} — ${allSent ? "all sent" : "some failed"}`);
}

export function registerBillingRoutes(app: Express): void {
  app.post('/api/create-subscription', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const user = await storage.getUser(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      if (subscription.status === 'active') {
        success(res, { subscriptionId: subscription.id, status: 'active' });
        return;
      }
    }

    if (!user.email) {
      throw new ApiError(400, 'No user email on file');
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
      success(res, {
        message: 'Unlimited subscription plan not configured in Stripe. Please use the checkout flow instead.',
        redirect: '/pricing'
      });
      return;
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

    success(res, { url: session.url, status: 'redirect' });
  }));

  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        logger.error('Webhook error: rawBody not available — ensure express.json verify callback is configured');
        return res.status(400).send('Webhook raw body unavailable');
      }
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        logger.error(
          'Webhook error: STRIPE_WEBHOOK_SECRET is not set. ' +
          'All plan activations via webhook are failing. ' +
          'Set STRIPE_WEBHOOK_SECRET to the whsec_... value from Stripe dashboard → Webhooks.'
        );
        return res.status(500).send('Webhook secret not configured');
      }
      event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Webhook signature verification failed');
      return res.status(400).send('Webhook signature verification failed');
    }

    try {
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
                const subStatus = subStatusForSubscriptionPackage(subPkgType);
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
                }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
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
                }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
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
          const user = await withRetry(() => storage.getUserByStripeCustomerId(customerId), 'webhook-invoice-user-fetch');
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
                }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
                logger.info({ userId: user.id }, '[Billing] Added 5 monthly credits to notification_pro user');
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
            }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
          }
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        let userId = session.metadata?.userId;
        let packageType = session.metadata?.packageType;
        let companyName: string | undefined = session.metadata?.companyName;

        if (!userId && session.client_reference_id) {
          const verified = verifyClientReferenceId(session.client_reference_id);
          if (verified) {
            userId = verified.userId;
            packageType = verified.packageType;
            companyName = verified.companyName;
          } else {
            logger.error({ clientRefId: session.client_reference_id }, 'Invalid client_reference_id signature');
          }
        }

        if (userId && packageType && session.payment_status === 'paid') {
          const sessionEmail = session.customer_details?.email || session.customer_email || undefined;
          const prevUser = await storage.getUser(userId);
          const prevStatus = prevUser?.subscriptionStatus || 'free';

          if (packageType === 'master') {
            // Not run inside a transaction with the claim — createPaidSubmission
            // goes through the repository layer's own `db`, not a shared `tx`.
            // Lower risk than the credit/subscription grants below: a duplicate
            // attempt after a claim/insert race hits no additive state (unlike
            // `credits: COALESCE(...) + N`), so at worst it's a redundant row,
            // not a silent double-grant or a silently-skipped one.
            if (await tryClaimSession(session.id)) {
              await storage.createPaidSubmission({
                email: session.customer_details?.email || '',
                packageType: 'full',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                priority: true,
                phoneConsultationRequested: true,
              });
            }
            break;
          }

          // Claim + grant run in one transaction so they commit or roll back
          // together. Previously the claim landed via a separate `db` call
          // before this transaction started: if the grant then threw, Stripe's
          // retry saw the session already claimed, skipped re-granting, and
          // got a 200 back — the customer paid and silently received nothing.
          const granted = await withRetry(() => db.transaction(async (tx) => {
            if (!(await tryClaimSession(session.id, tx))) {
              return false; // already processed by a prior successful delivery
            }
            await applyPackageGrant(tx, userId, packageType, session.subscription ?? null, session.customer ?? null);
            return true;
          }), 'webhook-checkout-session');

          // Side effects are deliberately outside the transaction — best-effort,
          // already fire-and-forget with their own `.catch()` — and only run
          // once the grant actually committed.
          if (granted) {
            if (packageType === 'starter') {
              sendSubscriptionNotifications(userId, 'CoS Check Starter', 'starter', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'starter', reason: 'Checkout: CoS Check Starter', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
            } else if (packageType === 'pro') {
              sendSubscriptionNotifications(userId, 'CoS Check Pro', 'pro', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'pro', reason: 'Checkout: CoS Check Pro', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
            } else if (packageType === 'unlimited') {
              sendSubscriptionNotifications(userId, 'CoS Check Unlimited', 'unlimited', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'unlimited', reason: 'Checkout: CoS Check Unlimited', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
            } else if (packageType === 'notification_starter') {
              sendSubscriptionNotifications(userId, 'Notification Engine Starter', 'notification_starter', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'starter', reason: 'Checkout: Sponsor Monitor Starter', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
              if (companyName) {
                autoCreateWatchFromPayment(userId, companyName).catch((err) => logger.error({ err }, '[AutoWatch] webhook starter failed'));
              }
            } else if (packageType === 'notification_pro') {
              sendSubscriptionNotifications(userId, 'Notification Engine Pro', 'notification_pro', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'pro', reason: 'Checkout: Sponsor Monitor Pro', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
              if (companyName) {
                autoCreateWatchFromPayment(userId, companyName).catch((err) => logger.error({ err }, '[AutoWatch] webhook pro failed'));
              }
            } else if (packageType === 'cos_check') {
              sendSubscriptionNotifications(userId, 'COS Check Subscription', 'cos_check', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
            } else if (packageType === 'alert_annual') {
              sendSubscriptionNotifications(userId, 'Alert Pass (Annual)', 'alert_annual', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'starter', reason: 'Checkout: Alert Pass Annual', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
              scheduleAnnualPassExpiry(session.subscription, userId, packageType).catch((err) => logger.error({ err }, '[AnnualPass] webhook alert_annual expiry scheduling failed'));
              if (companyName) {
                autoCreateWatchFromPayment(userId, companyName).catch((err) => logger.error({ err }, '[AutoWatch] webhook alert_annual failed'));
              }
            } else if (packageType === 'alert_annual_pro') {
              sendSubscriptionNotifications(userId, 'Alert Pass Pro (Annual)', 'alert_annual_pro', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
              storage.logSubscriptionChange({ userId, changedBy: 'stripe', source: 'stripe_webhook', previousStatus: prevStatus, newStatus: 'pro', reason: 'Checkout: Alert Pass Pro Annual', metadata: { stripeEventId: event.id, sessionId: session.id } }).catch((err) => { logger.error({ err }, "Failed to log subscription change"); });
              scheduleAnnualPassExpiry(session.subscription, userId, packageType).catch((err) => logger.error({ err }, '[AnnualPass] webhook alert_annual_pro expiry scheduling failed'));
              if (companyName) {
                autoCreateWatchFromPayment(userId, companyName).catch((err) => logger.error({ err }, '[AutoWatch] webhook alert_annual_pro failed'));
              }
            } else if (packageType === 'cos_check_single') {
              sendSubscriptionNotifications(userId, 'CoS Check (single)', 'cos_check_single', sessionEmail).catch((err) => logger.error({ err }, '[Subscription] Notification failed'));
            }
          }
        }
        break;
      }
    }
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err, eventType: event.type, eventId: event.id }, 'Webhook handler failed processing event');
      return res.status(500).send('Webhook handler error');
    }

    res.json({ received: true });
  });

  app.get('/api/packages', asyncHandler(async (req, res) => {
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

    success(res, { packages: Array.from(productsMap.values()) });
  }));

  // Stripe Customer Portal — lets paid users self-serve: update card, view
  // invoices, cancel subscription. Returns a short-lived portal URL.
  app.post('/api/billing/portal', isAuthenticated, asyncHandler(async (req: any, res) => {
    const user = await storage.getUser(req.user.id);
    if (!user?.stripeCustomerId) {
      throw new ApiError(400, 'No active subscription found. Subscribe to a plan first.');
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/pro-dashboard`,
    });
    success(res, { url: portalSession.url });
  }));

  app.post('/api/checkout/sign', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const { packageType, companyName } = req.body;
    const validTypes = ['starter', 'pro', 'unlimited', 'master', 'notification_starter', 'notification_pro'];
    if (!packageType || !validTypes.includes(packageType)) {
      throw new ApiError(400, 'Invalid package type');
    }
    const clientReferenceId = signClientReferenceId(userId, packageType, companyName || undefined);
    success(res, { clientReferenceId });
  }));

  app.post('/api/checkout/credits', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const { priceId, packageType, companyName } = req.body;

    if (!priceId || !packageType) {
      throw new ApiError(400, 'Missing priceId or packageType');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.email) {
      throw new ApiError(400, 'Email required for checkout');
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

    // alert_annual/alert_annual_pro are billed once a year but modeled as a
    // Stripe subscription with a hard cancel_at 12 months out — this lets the
    // existing customer.subscription.deleted webhook auto-downgrade the user
    // back to free at expiry instead of needing a separate cron job.
    const ANNUAL_PASS_TYPES = ['alert_annual', 'alert_annual_pro'];
    const isSubscription = packageType === 'unlimited' || ANNUAL_PASS_TYPES.includes(packageType);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const commonParams = {
      customer: customerId,
      payment_method_types: ['card'] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: { userId, packageType, ...(companyName ? { companyName: String(companyName).slice(0, 300) } : {}) },
    };

    const session = isSubscription
      ? await stripe.checkout.sessions.create({ ...commonParams, mode: 'subscription' })
      : await stripe.checkout.sessions.create({ ...commonParams, mode: 'payment' });

    success(res, { url: session.url, sessionId: session.id });
  }));

  app.get('/api/credits', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const credits = await storage.getCredits(userId);
    const user = await storage.getUser(userId);

    success(res, {
      credits,
      subscriptionStatus: user?.subscriptionStatus || 'free',
      isUnlimited: user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise' || user?.verificationLimit === -1
    });
  }));

  app.get('/api/checkout/verify/:sessionId', isAuthenticated, asyncHandler(async (req: any, res) => {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      let packageType = session.metadata?.packageType;
      let sessionUserId = session.metadata?.userId;
      let companyName: string | undefined = session.metadata?.companyName;

      if (!sessionUserId && session.client_reference_id) {
        const verified = verifyClientReferenceId(session.client_reference_id);
        if (verified && verified.userId === req.user.id) {
          sessionUserId = verified.userId;
          packageType = verified.packageType;
          companyName = verified.companyName;
        }
      }

      if (sessionUserId && sessionUserId === req.user.id) {
        if (packageType === 'master') {
          if (await tryClaimSession(sessionId)) {
            await storage.createPaidSubmission({
              email: session.customer_details?.email || req.user.email || '',
              packageType: 'full',
              paymentStatus: 'paid',
              stripeSessionId: session.id,
              priority: true,
              phoneConsultationRequested: true,
            });
          }
        } else {
          // Claim + grant in one transaction — see tryClaimSession's docstring.
          // Reloading this page after a failed grant must not silently report
          // stale pre-grant credits as "payment successful."
          const granted = await withRetry(() => db.transaction(async (tx) => {
            if (!(await tryClaimSession(sessionId, tx))) {
              return false;
            }
            await applyPackageGrant(tx, sessionUserId, packageType, (session.subscription as string) ?? null, (session.customer as string) ?? null);
            return true;
          }), 'checkout-verify-session');

          const AUTO_WATCH_TYPES = ['notification_starter', 'notification_pro', 'alert_annual', 'alert_annual_pro'];
          if (granted && !!packageType && AUTO_WATCH_TYPES.includes(packageType) && companyName) {
            await autoCreateWatchFromPayment(sessionUserId, companyName);
          }
          if (granted && (packageType === 'alert_annual' || packageType === 'alert_annual_pro')) {
            scheduleAnnualPassExpiry(session.subscription as string, sessionUserId, packageType).catch((err) => logger.error({ err }, '[AnnualPass] verify expiry scheduling failed'));
          }
        }

        const credits = await storage.getCredits(sessionUserId);
        const user = await storage.getUser(sessionUserId);

        success(res, {
          success: true,
          packageType,
          credits,
          subscriptionStatus: user?.subscriptionStatus,
          ...(companyName ? { companyName } : {}),
        });
      } else {
        throw new ApiError(403, 'Session does not belong to this user');
      }
    } else {
      success(res, { success: false, status: session.payment_status });
    }
  }));

  const stripeKeyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  });

  app.get('/api/stripe/publishable-key', stripeKeyLimiter, asyncHandler(async (req, res) => {
    if (process.env.STRIPE_PUBLISHABLE_KEY) {
      success(res, { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
      return;
    }
    // Replit-hosted deployments without STRIPE_PUBLISHABLE_KEY set fall back
    // to the Replit connector (Railway/Docker/etc. must set the env var above).
    const { getStripePublishableKey } = await import('../stripeClient');
    const key = await getStripePublishableKey();
    success(res, { publishableKey: key });
  }));
}

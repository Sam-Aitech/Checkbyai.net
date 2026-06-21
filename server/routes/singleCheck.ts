/**
 * Single Scam Check — £9.99 anonymous one-off report.
 *
 * The impulse-priced entry product for organic visitors: no account needed.
 *   1. POST /api/checkout/single-check  → Stripe Checkout session (mode: payment)
 *   2. Buyer pays; Stripe redirects to /single-check?session_id=…
 *   3. POST /api/verify/single          → upload CoS + offer details, gated on
 *      the paid (and not-yet-consumed) session; returns the full report:
 *      forensic document verdict + sponsor register status/history +
 *      salary-vs-threshold check + scam red flags.
 *
 * Session consumption is race-safe: the processed_checkouts claim is taken
 * only after analysis succeeds, so a failed upload can be retried, but a
 * session can never produce two reports.
 */

import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges, verificationResults } from "@shared/schema";
import { withRetry } from "../utils/dbRetry";
import { analyzeCosDocument } from "../services/cosAnalysisCore";
import { checkSalary, type SalaryCheckResult } from "../utils/salaryCheck";
import { normalizeName, generateFingerprint } from "../utils/sponsorListFetcher";
import { sanitizeUploadPath, assertSafeUploadFilename } from "../utils/uploadGuard";
import { tryClaimSession, isSessionProcessed } from "./billing";
import { upload } from "./verification";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-11-17.clover",
});

export const SINGLE_CHECK_PACKAGE_TYPE = "single_check";

// Checkout creation is cheap but abusable — 10/hour per IP is plenty for buyers.
const singleCheckoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many checkout attempts. Please wait before trying again.",
});

// Verification runs the full forensic pipeline — keep it tight.
const singleVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many verification attempts. Please wait before trying again.",
});

export const SCAM_RED_FLAGS = [
  {
    name: "You were asked to pay for the CoS",
    message:
      "It is illegal for anyone to charge a worker for a Certificate of Sponsorship or for the job itself. " +
      "If you paid an agent or 'employer' for this CoS, you are dealing with a scam — report it to Action Fraud.",
  },
  {
    name: "The job offer came without an interview",
    message:
      "Genuine UK sponsors interview candidates. An offer with no interview, or one conducted only over WhatsApp, is a strong scam signal.",
  },
  {
    name: "Pressure to pay quickly or in cash",
    message:
      "Scammers create urgency ('the CoS expires tomorrow'). A genuine employer never pressures you to transfer money.",
  },
  {
    name: "Salary far above or below the market",
    message:
      "Offers well above market rate for low-skill work, or below the visa salary thresholds, do not lead to a visa.",
  },
] as const;

interface SponsorReportSection {
  matched: boolean;
  sponsor: {
    id: number;
    name: string;
    townCity: string | null;
    route: string | null;
    typeRating: string | null;
    status: string;
  } | null;
  history: Array<{
    changeType: string;
    snapshotDate: string;
    previousValue: string | null;
    newValue: string | null;
  }>;
  note: string;
}

/** Look up the claimed sponsor in the canonical register: fingerprint, then name scan. */
async function buildSponsorSection(sponsorName: string | undefined): Promise<SponsorReportSection | null> {
  const trimmed = sponsorName?.trim();
  if (!trimmed) return null;

  type CanonicalRow = typeof sponsorCanonical.$inferSelect;
  const fp = generateFingerprint(trimmed, "", "");
  let match: CanonicalRow | null =
    (await db.select().from(sponsorCanonical).where(eq(sponsorCanonical.fingerprint, fp)).limit(1))[0] ?? null;

  if (!match) {
    const normalized = normalizeName(trimmed);
    match =
      (
        await db
          .select()
          .from(sponsorCanonical)
          .where(sql`lower(${sponsorCanonical.currentName}) LIKE ${"%" + normalized.toLowerCase() + "%"}`)
          .limit(1)
      )[0] ?? null;
  }

  if (!match) {
    return {
      matched: false,
      sponsor: null,
      history: [],
      note:
        `"${trimmed}" was not found on the Home Office Register of Licensed Sponsors. ` +
        `Either the name on your CoS is misspelled, or this company cannot sponsor UK visas — a major red flag.`,
    };
  }

  const history = await db
    .select({
      changeType: sponsorChanges.changeType,
      snapshotDate: sponsorChanges.snapshotDate,
      previousValue: sponsorChanges.previousValue,
      newValue: sponsorChanges.newValue,
    })
    .from(sponsorChanges)
    .where(eq(sponsorChanges.fingerprint, match.fingerprint))
    .orderBy(desc(sponsorChanges.detectedAt))
    .limit(10);

  const isLicensed = match.status === "ACTIVE" || match.status === "NEWLY_GRANTED";
  return {
    matched: true,
    sponsor: {
      id: match.id,
      name: match.currentName,
      townCity: match.townCity,
      route: match.route,
      typeRating: match.typeRating,
      status: match.status,
    },
    history,
    note: isLicensed
      ? `${match.currentName} holds a current sponsor licence. Remember: scammers reuse the names of real licensed sponsors — the document check above tells you whether THIS document is genuine.`
      : `${match.currentName} is on the register but its licence is not currently active (status: ${match.status}). A CoS from this company cannot support a visa application right now.`,
  };
}

export function registerSingleCheckRoutes(app: Express): void {
  // ── 1. Anonymous checkout ───────────────────────────────────────────────────
  app.post(
    "/api/checkout/single-check",
    singleCheckoutLimiter,
    asyncHandler(async (req: any, res) => {
      const allPrices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
      const price = allPrices.data.find((p) => {
        const prod = p.product as any;
        return prod?.metadata?.packageType === SINGLE_CHECK_PACKAGE_TYPE && !p.recurring;
      });

      if (!price) {
        throw new ApiError(503, "Single check product is not configured. Please try again later.");
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "payment",
        customer_creation: "if_required",
        success_url: `${baseUrl}/single-check?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/single-check`,
        metadata: { packageType: SINGLE_CHECK_PACKAGE_TYPE },
      });

      success(res, { url: session.url, sessionId: session.id });
    }),
  );

  // ── 2. Session status (lets the success page show paid/consumed state) ─────
  app.get(
    "/api/verify/single/status/:sessionId",
    asyncHandler(async (req: any, res) => {
      const { sessionId } = req.params;
      if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
        throw new ApiError(400, "Invalid session id.");
      }
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid =
        session.payment_status === "paid" &&
        session.metadata?.packageType === SINGLE_CHECK_PACKAGE_TYPE;
      const consumed = isPaid ? await isSessionProcessed(sessionId) : false;
      success(res, { paid: isPaid, consumed });
    }),
  );

  // ── 3. Anonymous verification, gated on paid session ───────────────────────
  app.post(
    "/api/verify/single",
    singleVerifyLimiter,
    upload.single("file"),
    asyncHandler(async (req: any, res) => {
      const { sessionId, sponsorName, annualSalaryGbp, socCode, jobTitle, applyingFromOverseas } = req.body;

      const cleanupUpload = async () => {
        if (req.file) {
          const p = sanitizeUploadPath(req.file.path);
          // codeql[js/path-injection] - validated by sanitizeUploadPath
          await fs.promises.unlink(p).catch(() => {});
        }
      };

      try {
        if (!sessionId || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
          throw new ApiError(400, "Missing or invalid payment session.");
        }
        if (!req.file) {
          throw new ApiError(400, "No file uploaded.");
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (
          session.payment_status !== "paid" ||
          session.metadata?.packageType !== SINGLE_CHECK_PACKAGE_TYPE
        ) {
          throw new ApiError(402, "Payment not completed for this check.");
        }
        if (await isSessionProcessed(sessionId)) {
          throw new ApiError(409, "This payment has already been used for a report.");
        }

        const safeFilePath = sanitizeUploadPath(req.file.path);
        assertSafeUploadFilename(req.file.originalname);

        // ── Run the three report sections ────────────────────────────────────
        const salaryNumber = annualSalaryGbp !== undefined ? Number(annualSalaryGbp) : NaN;
        const [docOutcome, sponsorSection] = await Promise.all([
          analyzeCosDocument(safeFilePath),
          buildSponsorSection(sponsorName),
        ]);
        const salarySection: SalaryCheckResult | null =
          Number.isFinite(salaryNumber) && salaryNumber > 0
            ? checkSalary({
                annualSalaryGbp: salaryNumber,
                socCode: typeof socCode === "string" ? socCode : undefined,
                jobTitle: typeof jobTitle === "string" ? jobTitle : undefined,
                applyingFromOverseas: applyingFromOverseas !== "false",
              })
            : null;

        // ── Claim the session only after analysis succeeded (single-use) ────
        if (!(await tryClaimSession(sessionId))) {
          throw new ApiError(409, "This payment has already been used for a report.");
        }

        // Persist the verification (anonymous — no userId)
        const verificationId = await withRetry(
          () =>
            db
              .insert(verificationResults)
              .values({
                userId: null,
                filename: path.basename(req.file!.originalname),
                result: docOutcome.result,
                confidence: Math.floor(docOutcome.analysis.confidence),
                metadata: docOutcome.isAdminOverride ? (docOutcome.priorAdminFlag?.metadata ?? {}) : docOutcome.metadata,
                analysisDetails: docOutcome.analysis,
                ipAddress: req.ip,
                receiptId: docOutcome.receiptId,
                documentHash: docOutcome.documentHash,
              } as any)
              .returning()
              .then((rows) => rows[0].id),
          "single-check-verify-result",
        );

        success(res, {
          id: verificationId,
          receiptId: docOutcome.receiptId,
          document: {
            result: docOutcome.result,
            confidence: docOutcome.analysis.confidence,
            details: docOutcome.analysis.details,
            checks: docOutcome.analysis.checks || [],
            cosCheck: docOutcome.analysis.cosCheck ?? null,
            adminOverride: docOutcome.isAdminOverride,
          },
          sponsor: sponsorSection,
          salary: salarySection,
          redFlags: SCAM_RED_FLAGS,
          timestamp: new Date().toISOString(),
        });

        logger.info(
          { sessionId, receiptId: docOutcome.receiptId, result: docOutcome.result },
          "[SingleCheck] Report generated",
        );
      } finally {
        await cleanupUpload();
      }
    }),
  );
}

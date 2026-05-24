/**
 * Resilient email sender with retry and admin alerting on repeated failures.
 *
 * Wraps Resend API calls with:
 *  - Up to 2 retries (exponential backoff: 1s, 3s)
 *  - Admin alert after all retries exhausted
 */

import { sendAdminAlert } from "./adminAlert";
import { logger } from "../utils/logger";

const MAX_RETRIES = 2;
const BACKOFF_MS = [1000, 3000]; // delays between retries

interface EmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

export async function sendEmailReliably(
  payload: EmailPayload,
  context: string, // e.g. "[Subscription]" — used in logs & alerts
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn(`${context} RESEND_API_KEY not set — email skipped: ${payload.subject}`);
    return false;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) return true;

      const body = await res.text();
      lastError = `Resend API ${res.status}: ${body}`;
      logger.error({ err: lastError }, `${context} Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`);
    } catch (err) {
      lastError = err;
      logger.error({ err: err }, `${context} Attempt ${attempt + 1}/${MAX_RETRIES + 1} threw:`);
    }

    // Wait before retrying (skip delay after last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }

  // All retries exhausted — alert admin
  sendAdminAlert(
    `Email delivery failed: ${payload.subject}`,
    `<p><strong>Context:</strong> ${context}</p>
     <p><strong>To:</strong> ${payload.to.join(", ")}</p>
     <p><strong>Subject:</strong> ${payload.subject}</p>
     <p><strong>Error:</strong> ${String(lastError)}</p>
     <p>All ${MAX_RETRIES + 1} attempts failed. Please investigate.</p>`,
  ).catch(() => {}); // best-effort alert; don't throw

  return false;
}

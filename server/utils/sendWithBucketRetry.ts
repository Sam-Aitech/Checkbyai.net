import type { Logger } from "pino";
import type { SendResult } from "../services/notificationChannels/types";
import { waitForBucket, BUCKETS } from "./tokenBucket";
import { jitterDelay } from "./jitterRetry";

/**
 * Shared "wait for a rate-limit bucket, attempt a send, retry up to 3 times
 * with jittered backoff on a 429/rate-limit error" loop. sms.ts and
 * whatsapp.ts had near-identical copies of this (same review flagged the
 * duplication) — the only real differences between them were the bucket
 * name/keySuffix and the send function itself, both parameterized here.
 */
export async function sendWithBucketRetry(
  bucket: keyof typeof BUCKETS,
  keySuffix: string,
  sendFn: () => Promise<SendResult>,
  log: Logger,
  label: string,
): Promise<SendResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForBucket(bucket, keySuffix);
    try {
      const result = await sendFn();
      if (result.success) return result;
      const is429 = result.error?.includes("429") || result.error?.includes("rate");
      if (!is429 || attempt === 2) return result;
      log.warn({ error: result.error, attempt }, `${label} retrying`);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      if (attempt === 2) return { success: false, error: m };
      log.warn({ err: m, attempt }, `${label} threw retrying`);
    }
    await new Promise((rr) => setTimeout(rr, jitterDelay(attempt, 1000, 30000)));
  }
  return { success: false, error: `${label} exhausted retries` };
}

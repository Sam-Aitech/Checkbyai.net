import { pool } from "../db";

const RETRYABLE_ERRORS = [
  "terminating connection due to administrator command",
  "connection terminated unexpectedly",
  "Connection terminated unexpectedly",
  "unable to connect",
  "ECONNRESET",
  "ECONNREFUSED",
  "socket hang up",
  "Client has encountered a connection error",
  "Connection refused",
  "timeout expired",
];

function isRetryableError(err: any): boolean {
  const msg = err?.message || String(err);
  return RETRYABLE_ERRORS.some(pattern => msg.includes(pattern));
}

async function warmConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
  } catch {
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxRetries: number = 3,
  delayMs: number = 2000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (isRetryableError(err)) {
        if (attempt < maxRetries) {
          const wait = delayMs * attempt;
          console.warn(`[DBRetry] ${label} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Warming connection and retrying in ${wait}ms...`);
          await new Promise(resolve => setTimeout(resolve, wait));
          await warmConnection();
        } else {
          console.error(`[DBRetry] ${label} failed on final attempt ${attempt}/${maxRetries}: ${err.message}`);
        }
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error(`${label} failed after ${maxRetries} retries`);
}

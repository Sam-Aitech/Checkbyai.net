export interface VerifyJobAccepted {
  jobId: string;
  receiptId: string;
  documentHash: string;
  statusUrl: string;
}

export async function pollVerificationJob(statusUrl: string, timeoutMs = 120000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(statusUrl, { credentials: "include" });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Verification poll failed (${res.status})`);
    }
    const body = await res.json();
    const payload = body.data ?? body;
    if (payload.status === "completed") {
      return payload.result;
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || "Verification failed");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Verification timed out — please check history shortly.");
}

export function isJobAccepted(data: any): data is VerifyJobAccepted {
  return Boolean(data && typeof data.jobId === "string" && typeof data.statusUrl === "string");
}

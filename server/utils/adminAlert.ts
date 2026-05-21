/**
 * Shared admin email alert utility.
 *
 * Used by sponsorMonitorJob.ts (job failure/completion summaries)
 * and sponsorListFetcher.ts (scraper fallback notifications).
 *
 * Reads RESEND_API_KEY and ADMIN_EMAIL from environment.
 * Silently no-ops if either is missing (safe to call from any context).
 */
export async function sendAdminAlert(
  subject: string,
  bodyHtml: string,
  from = "Sponsor Monitor <alerts@checkbyai.net>",
): Promise<void> {
  const apiKey     = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!apiKey || !adminEmail) {
    console.warn("[adminAlert] RESEND_API_KEY or ADMIN_EMAIL not configured — alert skipped:", subject);
    return;
  }

  try {
    // codeql[js/file-access-to-http] - This utility intentionally sends admin alert emails summarising file processing results. The bodyHtml is constructed by callers from structured data, not raw file contents.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [adminEmail], subject, html: bodyHtml }),
    });

    if (!response.ok) {
      console.error("[adminAlert] Resend API returned error:", await response.text());
    }
  } catch (err) {
    console.error("[adminAlert] Failed to send alert:", err);
  }
}

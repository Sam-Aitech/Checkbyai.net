import { getAppUrl } from "./appUrl";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildEmail(
  changeType: string,
  organisationName: string,
  previousValue: string | null | undefined,
  newValue: string | null | undefined,
): { subject: string; html: string } {
  const company = esc(organisationName);
  const prev = previousValue ? esc(previousValue) : null;
  const next = newValue ? esc(newValue) : null;

  type Meta = { bg: string; headline: string; subject: string; body: string };
  const meta: Record<string, Meta> = {
    REMOVED_REVOKED: {
      bg: "linear-gradient(135deg,#8B0000 0%,#CC0000 100%)",
      headline: "Sponsor Licence Removed",
      subject: `URGENT: ${organisationName} removed from UK sponsor licence register`,
      body: `<strong>${company}</strong> has been removed from the UK Home Office Register of Licensed Sponsors. If you hold a visa sponsored by this organisation, seek immigration advice immediately.`,
    },
    NEW_LICENCE: {
      bg: "linear-gradient(135deg,#003366 0%,#0066CC 100%)",
      headline: "New Sponsor Licence Granted",
      subject: `Update: ${organisationName} added to sponsor licence register`,
      body: `<strong>${company}</strong> has been added to the UK Home Office Register of Licensed Sponsors${next ? ` under the <strong>${next}</strong> route` : ""}.`,
    },
    RE_ACTIVATED: {
      bg: "linear-gradient(135deg,#003366 0%,#0066CC 100%)",
      headline: "Sponsor Licence Reinstated",
      subject: `Update: ${organisationName} has returned to the sponsor licence register`,
      body: `<strong>${company}</strong> has reappeared on the UK Home Office Register of Licensed Sponsors after a period of absence.`,
    },
    UPGRADED: {
      bg: "linear-gradient(135deg,#006633 0%,#009933 100%)",
      headline: "Sponsor Licence Upgraded",
      subject: `Good news: ${organisationName} sponsor licence upgraded`,
      body: `<strong>${company}</strong> has had their sponsor licence rating upgraded${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
    DOWNGRADED: {
      bg: "linear-gradient(135deg,#CC6600 0%,#FF8C00 100%)",
      headline: "Sponsor Licence Downgraded",
      subject: `Alert: ${organisationName} sponsor licence downgraded`,
      body: `<strong>${company}</strong> has had their sponsor licence rating downgraded${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}. The Home Office has identified compliance issues.`,
    },
    ROUTE_CHANGE: {
      bg: "linear-gradient(135deg,#4B0082 0%,#8A2BE2 100%)",
      headline: "Sponsor Route Changed",
      subject: `Update: ${organisationName} sponsor route changed`,
      body: `<strong>${company}</strong> has changed their sponsorship route${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
    NAME_CHANGE: {
      bg: "linear-gradient(135deg,#333 0%,#666 100%)",
      headline: "Organisation Name Changed",
      subject: `Update: ${organisationName} has changed name`,
      body: `This sponsor has changed their registered name${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
  };

  const m = meta[changeType] ?? meta.NEW_LICENCE;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${m.bg};padding:30px;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;text-align:center;font-size:22px;">${m.headline}</h1>
      </div>
      <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;">
        <p style="color:#333;font-size:15px;line-height:1.6;margin:0;">${m.body}</p>
      </div>
      <div style="background:#f8f9fa;padding:20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#666;font-size:12px;margin:0 0 8px;text-align:center;">
          You are receiving this because you are watching <strong>${company}</strong> on Check By AI Sponsor Monitor.
        </p>
        <p style="color:#999;font-size:11px;margin:0;text-align:center;">
          Manage your preferences at
          <a href="${getAppUrl()}/dashboard/sponsor" style="color:#0066CC;">checkbyai.net/dashboard/sponsor</a>
        </p>
      </div>
    </div>`;

  return { subject: m.subject, html };
}

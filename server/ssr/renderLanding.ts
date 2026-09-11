import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_COPY } from "../../shared/landingCopy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SSR_MARKER = "<!--SSR-->";
const SSR_END_MARKER = "<!--/SSR-->";

/**
 * Static pre-hydration landing. Mirrors the client section order in
 * client/src/components/HeroSection.tsx:
 * nav → hero (eyebrow, H1, sub, CTAs, search, trust) → check CTA →
 * why-alerts → how-it-works → CoS verify → revoked → footer.
 * Copy comes from shared/landingCopy.ts so both stay identical.
 * Styling uses theme CSS vars (never hard-coded hex) with the same
 * container rhythm (80rem/60rem/45rem, 1.5rem gutters) and pill CTAs.
 * Dynamic blocks (live search, nightly stats, revocation rows) render as
 * static shells with copy + links — no fabricated numbers.
 */
function landingHTML(): string {
  const c = LANDING_COPY;
  const trust = c.trust
    .map(
      (t) =>
        `<span style="display:inline-flex;align-items:center;gap:0.5rem;color:var(--hero-fg-secondary);font-size:0.875rem;font-weight:600;">&#10003; ${t}</span>`
    )
    .join("");
  return `
<div class="ssr-landing">
<style>@media (max-width:640px){.ssr-hide-sm{display:none !important;}}</style>
<div style="background:linear-gradient(180deg, var(--gradient-start) 0%, var(--gradient-mid) 40%, var(--gradient-end) 100%);padding-bottom:4rem;">
  <nav style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;max-width:80rem;margin:0 auto;">
    <a href="/" style="font-weight:700;font-size:1.25rem;color:var(--hero-fg);text-decoration:none;">
      <span>Check</span>ByAI
    </a>
    <div style="display:flex;gap:1rem;align-items:center;">
      <a href="/sponsor-monitor" class="ssr-hide-sm" style="color:var(--hero-fg-secondary);text-decoration:none;font-size:0.875rem;">Sponsor Monitor</a>
      <a href="/pricing" class="ssr-hide-sm" style="color:var(--hero-fg-secondary);text-decoration:none;font-size:0.875rem;">Pricing</a>
      <a href="/login" style="display:inline-flex;align-items:center;padding:0.5rem 1.25rem;background:var(--primary);color:var(--primary-foreground);border-radius:999px;text-decoration:none;font-size:0.875rem;font-weight:500;">Sign In</a>
    </div>
  </nav>

  <section style="max-width:80rem;margin:4rem auto;padding:0 1.5rem;text-align:center;">
    <p style="display:inline-flex;align-items:center;gap:0.5rem;color:var(--hero-fg-secondary);font-size:0.75rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:1.5rem;">${c.hero.eyebrow}</p>
    <h1 style="font-size:clamp(2.25rem,1.6rem + 3vw,3.4rem);font-weight:800;color:var(--hero-fg);line-height:1.06;letter-spacing:-0.03em;margin-bottom:1.5rem;">
      ${c.hero.titleMain} <span style="background:linear-gradient(90deg,#818cf8,#6366f1);-webkit-background-clip:text;background-clip:text;color:transparent;">${c.hero.titleAccent}</span>
    </h1>
    <p style="font-size:0.875rem;color:var(--hero-fg-secondary);max-width:640px;margin:0 auto 2.5rem;line-height:1.55;">
      ${c.hero.sub}
    </p>
    <form action="/sponsors" method="get" style="max-width:640px;margin:0 auto 1rem;display:flex;gap:0.5rem;">
      <label for="ssr-search" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Search the UK sponsor register</label>
      <input id="ssr-search" name="q" type="search" placeholder="${c.hero.searchPlaceholder}" style="flex:1;min-height:44px;padding:0.75rem 1rem;border:1px solid rgba(255,255,255,0.2);border-radius:0.5rem;background:rgba(255,255,255,0.1);color:var(--hero-fg);font-size:0.875rem;" />
      <button type="submit" style="min-height:44px;padding:0.75rem 1.5rem;border:none;border-radius:999px;background:var(--primary);color:var(--primary-foreground);font-size:0.875rem;font-weight:600;cursor:pointer;">Search</button>
    </form>
    <p style="font-size:0.75rem;color:var(--hero-fg-tertiary);margin-bottom:2rem;">${c.hero.searchHelper}</p>
    <div style="display:flex;gap:1.5rem;justify-content:center;flex-wrap:wrap;">${trust}</div>
  </section>
</div>

  <section style="max-width:45rem;margin:0 auto;padding:4rem 1.5rem;text-align:center;">
    <p style="font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--status-danger);margin-bottom:1rem;">${c.check.eyebrow}</p>
    <h2 style="font-size:clamp(1.875rem,1.5rem + 2vw,2.5rem);font-weight:700;color:var(--foreground);line-height:1.1;letter-spacing:-0.02em;margin-bottom:0.75rem;">${c.check.title}</h2>
    <p style="color:var(--muted-foreground);max-width:36rem;margin:0 auto 2rem;line-height:1.6;">${c.check.sub}</p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      <a href="/sponsors" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;background:var(--primary);color:var(--primary-foreground);border-radius:999px;text-decoration:none;font-weight:600;">${c.hero.secondaryCta}</a>
      <a href="/sponsor-monitor" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;border:1px solid var(--border);color:var(--foreground);border-radius:0.5rem;text-decoration:none;font-weight:600;background:var(--card);">${c.hero.primaryCta}</a>
    </div>
  </section>

  <section style="max-width:60rem;margin:0 auto;padding:4rem 1.5rem;text-align:center;">
    <p style="font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--status-success);margin-bottom:1rem;">${c.why.eyebrow}</p>
    <h2 style="font-size:clamp(1.875rem,1.5rem + 2vw,2.5rem);font-weight:700;color:var(--foreground);line-height:1.1;letter-spacing:-0.02em;margin-bottom:1rem;">${c.why.title}</h2>
    <p style="color:var(--muted-foreground);max-width:36rem;margin:0 auto;line-height:1.6;">${c.why.sub}</p>
  </section>

  <section style="max-width:80rem;margin:0 auto;padding:4rem 1.5rem;">
    <h2 style="font-size:1.75rem;font-weight:700;color:var(--foreground);text-align:center;margin-bottom:3rem;">How It Works</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:2rem;">
      <div style="padding:2rem;border:1px solid var(--border);border-radius:0.75rem;text-align:center;background:var(--card);">
        <div style="width:3rem;height:3rem;background:var(--muted);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:var(--primary);">1</span>
        </div>
        <h3 style="font-weight:600;color:var(--foreground);margin-bottom:0.75rem;">Enter Sponsor Name</h3>
        <p style="color:var(--muted-foreground);font-size:0.875rem;line-height:1.5;">Search the UK Sponsor Register for your employer's licence.</p>
      </div>
      <div style="padding:2rem;border:1px solid var(--border);border-radius:0.75rem;text-align:center;background:var(--card);">
        <div style="width:3rem;height:3rem;background:var(--muted);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:var(--primary);">2</span>
        </div>
        <h3 style="font-weight:600;color:var(--foreground);margin-bottom:0.75rem;">Choose Alerts</h3>
        <p style="color:var(--muted-foreground);font-size:0.875rem;line-height:1.5;">Pick WhatsApp, email, SMS, or webhook for instant notifications.</p>
      </div>
      <div style="padding:2rem;border:1px solid var(--border);border-radius:0.75rem;text-align:center;background:var(--card);">
        <div style="width:3rem;height:3rem;background:var(--muted);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:var(--primary);">3</span>
        </div>
        <h3 style="font-weight:600;color:var(--foreground);margin-bottom:0.75rem;">Get Notified</h3>
        <p style="color:var(--muted-foreground);font-size:0.875rem;line-height:1.5;">We scan daily and alert you the moment anything changes.</p>
      </div>
    </div>
  </section>

  <section style="max-width:80rem;margin:0 auto;padding:4rem 1.5rem;text-align:center;">
    <p style="font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--primary);margin-bottom:1rem;">${c.cos.eyebrow}</p>
    <h2 style="font-size:clamp(1.875rem,1.5rem + 2vw,2.5rem);font-weight:700;color:var(--foreground);line-height:1.1;letter-spacing:-0.02em;margin-bottom:1rem;">${c.cos.title}</h2>
    <p style="color:var(--muted-foreground);max-width:560px;margin:0 auto 2rem;line-height:1.6;">
      ${c.cos.sub}
    </p>
    <a href="/dashboard" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;background:var(--primary);color:var(--primary-foreground);border-radius:999px;text-decoration:none;font-weight:600;">
      ${c.cos.cta}
      <span style="margin-left:0.5rem;">&rarr;</span>
    </a>
  </section>

  <section style="max-width:60rem;margin:0 auto;padding:4rem 1.5rem;text-align:center;">
    <h2 style="font-size:1.5rem;font-weight:700;color:var(--foreground);margin-bottom:0.5rem;">${c.revoked.title}</h2>
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1.5rem;">${c.revoked.sub}</p>
    <a href="/sponsor-changes" style="display:inline-flex;align-items:center;padding:0.625rem 1.25rem;border:1px solid var(--border);color:var(--foreground);border-radius:999px;text-decoration:none;font-weight:600;font-size:0.875rem;background:var(--card);">${c.revoked.cta} &rarr;</a>
  </section>

  <footer style="border-top:1px solid var(--border);padding:2rem;margin-top:4rem;">
    <div style="max-width:80rem;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
      <div style="color:var(--muted-foreground);font-size:0.875rem;">&copy; 2026 Check By AI. UK immigration tools.</div>
      <div style="display:flex;gap:1.5rem;">
        <a href="/about" style="color:var(--muted-foreground);text-decoration:none;font-size:0.875rem;">About</a>
        <a href="/pricing" style="color:var(--muted-foreground);text-decoration:none;font-size:0.875rem;">Pricing</a>
        <a href="/sponsor-monitor" style="color:var(--muted-foreground);text-decoration:none;font-size:0.875rem;">Sponsor Monitor</a>
      </div>
    </div>
  </footer>
</div>
`.trim();
}

export function renderLandingPage(templatePath?: string, preloadedTemplate?: string): string {
  let template: string;

  if (preloadedTemplate === undefined) {
    const resolvedPath = templatePath ?? path.resolve(__dirname, "..", "..", "client", "index.html");
    try {
      template = fs.readFileSync(resolvedPath, "utf-8");
    } catch {
      throw new Error(
        `Could not read template at ${resolvedPath}. Make sure the file exists.`
      );
    }
  } else {
    template = preloadedTemplate;
  }

  const rootContent = landingHTML();

  const startIdx = template.indexOf(SSR_MARKER);
  const endIdx = template.indexOf(SSR_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error("SSR markers not found in template. Ensure <!--SSR--> and <!--/SSR--> are present in index.html.");
  }

  const prefix = template.slice(0, startIdx + SSR_MARKER.length);
  const suffix = template.slice(endIdx);

  return `${prefix}\n${rootContent}\n${suffix}`;
}

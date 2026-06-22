import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SSR_MARKER = "<!--SSR-->";
const SSR_END_MARKER = "<!--/SSR-->";

function landingHTML(): string {
  return `
<div class="ssr-landing">
  <nav style="display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;max-width:1280px;margin:0 auto;">
    <a href="/" style="font-weight:700;font-size:1.25rem;color:#1f2937;text-decoration:none;">
      <span style="color:#2563eb;">Check</span>ByAI
    </a>
    <div style="display:flex;gap:1rem;align-items:center;">
      <a href="/sponsor-monitor" style="color:#6b7280;text-decoration:none;font-size:0.875rem;">Sponsor Monitor</a>
      <a href="/pricing" style="color:#6b7280;text-decoration:none;font-size:0.875rem;">Pricing</a>
      <a href="/login" style="display:inline-flex;align-items:center;padding:0.5rem 1.25rem;background:#2563eb;color:#fff;border-radius:0.75rem;text-decoration:none;font-size:0.875rem;font-weight:500;">Sign In</a>
    </div>
  </nav>

  <section style="max-width:1280px;margin:4rem auto;padding:0 2rem;text-align:center;">
    <h1 style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;color:#1f2937;line-height:1.15;margin-bottom:1.5rem;">
      Never Miss a <span style="color:#2563eb;">Sponsor Licence</span> Revocation Again
    </h1>
    <p style="font-size:1.125rem;color:#6b7280;max-width:640px;margin:0 auto 2.5rem;line-height:1.6;">
      Real-time monitoring of the UK Sponsor Register with instant WhatsApp, email, SMS, and webhook alerts when your employer's licence status changes.
    </p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      <a href="/sponsor-monitor" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;background:#2563eb;color:#fff;border-radius:0.75rem;text-decoration:none;font-weight:600;font-size:1rem;">
        Monitor a Sponsor
        <span style="margin-left:0.5rem;">&rarr;</span>
      </a>
      <a href="/sponsors" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;border:2px solid #e5e7eb;color:#1f2937;border-radius:0.75rem;text-decoration:none;font-weight:600;font-size:1rem;">
        Browse Register
      </a>
    </div>
  </section>

  <section style="max-width:1280px;margin:0 auto;padding:3rem 2rem;">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.5rem;text-align:center;">
      <div style="padding:2rem;background:#f9fafb;border-radius:1rem;">
        <div style="font-size:2rem;font-weight:800;color:#2563eb;margin-bottom:0.5rem;">99.9%</div>
        <div style="color:#6b7280;font-size:0.875rem;">Uptime Monitoring</div>
      </div>
      <div style="padding:2rem;background:#f9fafb;border-radius:1rem;">
        <div style="font-size:2rem;font-weight:800;color:#2563eb;margin-bottom:0.5rem;">4</div>
        <div style="color:#6b7280;font-size:0.875rem;">Alert Channels</div>
      </div>
      <div style="padding:2rem;background:#f9fafb;border-radius:1rem;">
        <div style="font-size:2rem;font-weight:800;color:#2563eb;margin-bottom:0.5rem;">Instant</div>
        <div style="color:#6b7280;font-size:0.875rem;">Revocation Alerts</div>
      </div>
      <div style="padding:2rem;background:#f9fafb;border-radius:1rem;">
        <div style="font-size:2rem;font-weight:800;color:#2563eb;margin-bottom:0.5rem;">24/7</div>
        <div style="color:#6b7280;font-size:0.875rem;">Register Scanning</div>
      </div>
    </div>
  </section>

  <section style="max-width:1280px;margin:0 auto;padding:4rem 2rem;">
    <h2 style="font-size:1.75rem;font-weight:700;color:#1f2937;text-align:center;margin-bottom:3rem;">How It Works</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:2rem;">
      <div style="padding:2rem;border:1px solid #e5e7eb;border-radius:1rem;text-align:center;">
        <div style="width:3rem;height:3rem;background:#2563eb10;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:#2563eb;">1</span>
        </div>
        <h3 style="font-weight:600;color:#1f2937;margin-bottom:0.75rem;">Enter Sponsor Name</h3>
        <p style="color:#6b7280;font-size:0.875rem;line-height:1.5;">Search the UK Sponsor Register for your employer's licence.</p>
      </div>
      <div style="padding:2rem;border:1px solid #e5e7eb;border-radius:1rem;text-align:center;">
        <div style="width:3rem;height:3rem;background:#2563eb10;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:#2563eb;">2</span>
        </div>
        <h3 style="font-weight:600;color:#1f2937;margin-bottom:0.75rem;">Choose Alerts</h3>
        <p style="color:#6b7280;font-size:0.875rem;line-height:1.5;">Pick WhatsApp, email, SMS, or webhook for instant notifications.</p>
      </div>
      <div style="padding:2rem;border:1px solid #e5e7eb;border-radius:1rem;text-align:center;">
        <div style="width:3rem;height:3rem;background:#2563eb10;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <span style="font-size:1.25rem;font-weight:700;color:#2563eb;">3</span>
        </div>
        <h3 style="font-weight:600;color:#1f2937;margin-bottom:0.75rem;">Get Notified</h3>
        <p style="color:#6b7280;font-size:0.875rem;line-height:1.5;">We scan daily and alert you the moment anything changes.</p>
      </div>
    </div>
  </section>

  <section style="max-width:1280px;margin:0 auto;padding:4rem 2rem;text-align:center;">
    <h2 style="font-size:1.75rem;font-weight:700;color:#1f2937;margin-bottom:1rem;">Verify a Certificate of Sponsorship</h2>
    <p style="color:#6b7280;max-width:560px;margin:0 auto 2rem;line-height:1.6;">
      Upload your CoS document and our AI detects fake or altered certificates instantly. Free for all UK visa applicants.
    </p>
    <a href="/dashboard" style="display:inline-flex;align-items:center;padding:0.875rem 2rem;background:#2563eb;color:#fff;border-radius:0.75rem;text-decoration:none;font-weight:600;">
      Verify Your CoS
      <span style="margin-left:0.5rem;">&rarr;</span>
    </a>
  </section>

  <footer style="border-top:1px solid #e5e7eb;padding:2rem;margin-top:4rem;">
    <div style="max-width:1280px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
      <div style="color:#6b7280;font-size:0.875rem;">&copy; 2026 Check By AI. UK immigration tools.</div>
      <div style="display:flex;gap:1.5rem;">
        <a href="/about" style="color:#6b7280;text-decoration:none;font-size:0.875rem;">About</a>
        <a href="/pricing" style="color:#6b7280;text-decoration:none;font-size:0.875rem;">Pricing</a>
        <a href="/sponsor-monitor" style="color:#6b7280;text-decoration:none;font-size:0.875rem;">Sponsor Monitor</a>
      </div>
    </div>
  </footer>
</div>
`.trim();
}

export function renderLandingPage(templatePath?: string, preloadedTemplate?: string): string {
  let template: string;

  if (preloadedTemplate !== undefined) {
    template = preloadedTemplate;
  } else {
    const resolvedPath = templatePath ?? path.resolve(__dirname, "..", "..", "client", "index.html");
    try {
      template = fs.readFileSync(resolvedPath, "utf-8");
    } catch {
      throw new Error(
        `Could not read template at ${resolvedPath}. Make sure the file exists.`
      );
    }
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

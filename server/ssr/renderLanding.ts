import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SSR_MARKER = "<!--SSR-->";
const SSR_END_MARKER = "<!--/SSR-->";

// Visually-hidden ("sr-only") pattern: zero visual footprint (0x0, clipped,
// no layout box), so crawlers/no-JS clients still get real semantic content
// and links, but there is no second, differently-styled page rendered before
// React mounts. This intentionally does NOT try to visually reproduce the
// live homepage design — see CLAUDE.md P0: two competing hand-styled designs
// (this vs. the React <Home>/<HeroSection>) was the defect. A visible design
// would drift from the real one over time and reintroduce that same flash on
// every future homepage redesign; an invisible one physically can't.
const SSR_HIDDEN_STYLE =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";

function landingHTML(): string {
  return `
<div class="ssr-landing" style="${SSR_HIDDEN_STYLE}">
  <h1>UK Sponsor Licence Monitoring &amp; Certificate of Sponsorship Verification</h1>
  <p>
    Real-time monitoring of the UK Sponsor Register with instant WhatsApp, email, SMS, and webhook
    alerts when your employer's licence status changes. Free AI-powered Certificate of Sponsorship
    verification for UK Skilled Worker visa applicants.
  </p>
  <nav aria-label="Primary">
    <a href="/sponsor-monitor">Sponsor Monitor</a>
    <a href="/sponsors">Browse the UK Sponsor Register</a>
    <a href="/dashboard">Verify a Certificate of Sponsorship</a>
    <a href="/pricing">Pricing</a>
    <a href="/login">Sign In</a>
  </nav>
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

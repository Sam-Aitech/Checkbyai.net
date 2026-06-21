/**
 * sponsorSeoHtml.test.ts
 *
 * Verifies the server-rendered sponsor page content used for SEO:
 *   A. Body contains the load-bearing content (name, status, history, CTA)
 *   B. HTML special characters in register data are escaped
 *   C. JSON-LD is valid JSON and contains FAQPage + BreadcrumbList
 *   D. The #root injection regex used in routes/seo.ts matches the real
 *      client/index.html template (guards against template drift)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildSponsorSeoBody, buildSponsorJsonLd } from "../sponsorSeoHtml";

function makeSponsor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    fingerprint: "abc123",
    currentName: "Acme Care Ltd",
    townCity: "Leeds",
    county: "West Yorkshire",
    typeRating: "Worker (A rating)",
    route: "Skilled Worker",
    status: "ACTIVE",
    firstSeen: "2023-01-10",
    lastSeen: "2026-06-12",
    grantedAt: new Date("2023-01-10"),
    removedAt: null,
    historicalNames: [],
    ...overrides,
  } as any;
}

const changes = [
  {
    changeType: "UPGRADED",
    snapshotDate: "2025-03-01",
    previousValue: "Worker (B rating)",
    newValue: "Worker (A rating)",
  },
  {
    changeType: "NEW_LICENCE",
    snapshotDate: "2023-01-10",
    previousValue: null,
    newValue: "Worker (B rating)",
  },
];

describe("buildSponsorSeoBody", () => {
  it("renders name, status, register details, history, and CTA links", () => {
    const html = buildSponsorSeoBody(makeSponsor(), changes as any);
    expect(html).toContain("Acme Care Ltd");
    expect(html).toContain("Active UK Sponsor Licence");
    expect(html).toContain("Skilled Worker");
    expect(html).toContain("Licence history");
    expect(html).toContain("Rating upgraded");
    expect(html).toContain('href="/single-check"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("Open Government Licence");
  });

  it("shows revoked warning with what-to-do link for removed sponsors", () => {
    const html = buildSponsorSeoBody(
      makeSponsor({ status: "REMOVED_REVOKED", removedAt: new Date("2026-05-01") }),
      [] as any,
    );
    expect(html).toContain("Warning:");
    expect(html).toContain('href="/what-to-do-fake-cos"');
    expect(html).toContain("no longer a licensed sponsor");
  });

  it("escapes HTML special characters from register data", () => {
    const html = buildSponsorSeoBody(
      makeSponsor({ currentName: 'B&Q <"Stores"> Ltd' }),
      [] as any,
    );
    expect(html).toContain("B&amp;Q &lt;&quot;Stores&quot;&gt; Ltd");
    expect(html).not.toContain('<"Stores">');
  });

  it("omits history section when there are no changes", () => {
    const html = buildSponsorSeoBody(makeSponsor(), [] as any);
    expect(html).not.toContain("Licence history");
  });
});

describe("buildSponsorJsonLd", () => {
  it("produces valid FAQPage and BreadcrumbList JSON-LD", () => {
    const out = buildSponsorJsonLd(
      makeSponsor(),
      "https://checkbyai.net/sponsor/42/acme-care-ltd",
      "https://checkbyai.net",
    );
    const blocks = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    expect(blocks).toHaveLength(2);
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList");
    expect(faq).toBeDefined();
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
    expect(faq.mainEntity[0].name).toContain("Acme Care Ltd");
    expect(crumbs.itemListElement).toHaveLength(3);
  });

  it("answers 'is licensed' negatively for revoked sponsors", () => {
    const out = buildSponsorJsonLd(
      makeSponsor({ status: "REMOVED_REVOKED" }),
      "https://checkbyai.net/sponsor/42/acme-care-ltd",
      "https://checkbyai.net",
    );
    expect(out).toContain("no longer appears on the Home Office Register");
  });
});

describe("#root injection regex vs real templates", () => {
  // Must stay in sync with the regex in server/routes/seo.ts
  const ROOT_INJECT_REGEX = /(<div id="root">)[\s\S]*?(<\/div>\s*<script type=")/;

  const templates = [
    ["dev", path.resolve(import.meta.dirname, "../../../client/index.html")],
    ["built", path.resolve(import.meta.dirname, "../../../dist/public/index.html")],
  ] as const;

  for (const [label, templatePath] of templates) {
    it(`matches ${label} index.html and replaces shell content`, () => {
      if (!fs.existsSync(templatePath)) {
        // dist may not exist in CI before a build — dev template always must
        expect(label).toBe("built");
        return;
      }
      const html = fs.readFileSync(templatePath, "utf-8");
      expect(ROOT_INJECT_REGEX.test(html)).toBe(true);

      const body = buildSponsorSeoBody(makeSponsor(), changes as any);
      const injected = html.replace(ROOT_INJECT_REGEX, `$1${body}$2`);
      expect(injected).toContain("Acme Care Ltd");
      // Original shell content inside #root must be gone
      expect(injected).not.toContain("UK Certificate of Sponsorship Verification\n");
      // Module script still present so React hydrates
      expect(injected).toContain('<script type="module"');
    });
  }
});

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readClient(rel: string): string {
  return fs.readFileSync(path.resolve(import.meta.dirname, "../../../client/src", rel), "utf-8");
}

describe("Customer-facing copy safety (static)", () => {
  it("presents API access as limited pilot, never as shipped self-serve", () => {
    const cosPricing = readClient("pages/CosPricing.tsx");
    expect(cosPricing).toContain("limited pilot");
    expect(cosPricing).not.toContain("CSV upload and API access");

    const apiDocs = readClient("pages/ApiDocs.tsx");
    expect(apiDocs).toContain("Limited Pilot");
    expect(apiDocs).toContain("approval required");
  });

  it("routes high-intent CoS CTAs to /cos-pricing, not hidden beta gates", () => {
    for (const file of ["pages/WhatToDoFakeCoS.tsx", "pages/AIGuide.tsx", "pages/Technology.tsx"]) {
      const src = readClient(file);
      expect(src).toContain('href="/cos-pricing"');
    }
    const whatToDo = readClient("pages/WhatToDoFakeCoS.tsx");
    expect(whatToDo).not.toContain('href="/dashboard"');
  });

  it("preserves digest timing language and canonical sponsor counts", () => {
    const hero = readClient("components/HeroSection.tsx");
    expect(hero).not.toContain("Get instant WhatsApp or email alerts when any sponsor revokes");
    expect(hero).toContain("124,000+");

    const dir = readClient("pages/SponsorDirectory.tsx");
    expect(dir).toContain("124,000+");
    expect(dir).not.toContain("80,000+");
  });

  it("keeps sponsor watch return-URL preservation intact", () => {
    const monitor = readClient("pages/SponsorMonitor.tsx");
    expect(monitor).toContain("/login?redirect=");
    expect(monitor).toContain("addWatch=1");
  });

  it("uses neutral GOV.UK revocation wording on all customer-facing pages", () => {
    for (const file of ["pages/SponsorDetail.tsx", "pages/SponsorMonitor.tsx"]) {
      const src = readClient(file);
      expect(src).toContain("Check current GOV.UK guidance");
      expect(src).not.toContain("60-day window");
      expect(src).not.toContain("typically have 60 days");
    }
    expect(readClient("pages/SponsorDetail.tsx")).not.toContain("/single-check");
    expect(readClient("pages/SponsorDetail.tsx")).not.toContain("/guides/");
  });

  it("keeps Technology claims pilot-qualified without definitive/SLA overclaims", () => {
    const src = readClient("pages/Technology.tsx");
    expect(src).toContain("limited pilot");
    expect(src).not.toContain("available via a RESTful API");
    expect(src).not.toContain("definitive assessments");
    expect(src).not.toContain("99.99%");
    expect(src).not.toContain("10,000+");
    expect(src).not.toContain("industry-leading accuracy");
    expect(src).not.toContain("escalated to qualified immigration professionals");
    expect(src).not.toContain("never interrupted");
    expect(src).not.toContain("no single point of failure");
    expect(src).not.toContain("Automatic Failover");
  });

  it("uses current GOV.UK civil-penalty figures in the employer guide", () => {
    const guide = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../client/public/guides/employers-guide-fake-cos.html"),
      "utf-8",
    );
    expect(guide).toContain("£60,000");
    expect(guide).not.toContain("up to £20,000 per illegal worker");
  });

  it("frames CoS SEO metadata as technical risk analysis, not genuineness verdicts", () => {
    const dashboard = readClient("pages/dashboard.tsx");
    expect(dashboard).toContain("technical risk analysis");
    expect(dashboard).toContain("Not a genuineness verdict");
    expect(dashboard).not.toContain("find out if it's genuine in under 60 seconds");
    const cosPricing = readClient("pages/CosPricing.tsx");
    expect(cosPricing).toContain("Not a genuineness verdict");
    expect(cosPricing).not.toContain("Verify Your CoS is Genuine");
  });

  it("uses neutral notification language in the hero H1", () => {
    const hero = readClient("components/HeroSection.tsx");
    expect(hero).toContain("Get notified when your sponsor's licence changes");
    expect(hero).not.toContain("the night your sponsor's licence changes");
  });
});

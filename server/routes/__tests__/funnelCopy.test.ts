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
});

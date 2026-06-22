import { describe, it, expect } from "vitest";
import { buildEmail, esc } from "../emailTemplates";

describe("esc", () => {
  it("escapes & < >", () => {
    expect(esc("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("passes through safe strings", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(esc("")).toBe("");
  });
});

describe("buildEmail", () => {
  it("REMOVED_REVOKED: subject includes URGENT", () => {
    const result = buildEmail("REMOVED_REVOKED", "Acme Ltd", "Active", "Revoked");
    expect(result.subject).toContain("URGENT");
    expect(result.subject).toContain("Acme Ltd");
    expect(result.html).toContain("removed");
  });

  it("NEW_LICENCE: includes route name in body when next value given", () => {
    const result = buildEmail("NEW_LICENCE", "Beta Inc", null, "Skilled Worker");
    expect(result.html).toContain("Skilled Worker");
    expect(result.subject).toContain("added");
  });

  it("RE_ACTIVATED: mentions return after absence", () => {
    const result = buildEmail("RE_ACTIVATED", "Gamma Ltd", "REMOVED_REVOKED", "NEWLY_GRANTED");
    expect(result.html).toContain("reappeared");
    expect(result.subject).toContain("returned");
  });

  it("UPGRADED: shows rating change in body", () => {
    const result = buildEmail("UPGRADED", "Delta Co", "B", "A");
    expect(result.html).toContain("B");
    expect(result.html).toContain("A");
    expect(result.html).toContain("upgraded");
  });

  it("DOWNGRADED: shows rating change + compliance note", () => {
    const result = buildEmail("DOWNGRADED", "Epsilon Ltd", "A", "B");
    expect(result.html).toContain("A");
    expect(result.html).toContain("B");
    expect(result.html).toContain("compliance issues");
  });

  it("ROUTE_CHANGE: shows route transition", () => {
    const result = buildEmail("ROUTE_CHANGE", "Zeta Inc", "Tier 2", "Skilled Worker");
    expect(result.html).toContain("Tier 2");
    expect(result.html).toContain("Skilled Worker");
  });

  it("NAME_CHANGE: shows old and new name", () => {
    const result = buildEmail("NAME_CHANGE", "NewName Ltd", "OldName Ltd", "NewName Ltd");
    expect(result.html).toContain("OldName Ltd");
    expect(result.html).toContain("NewName Ltd");
  });

  it("unknown change type falls back to NEW_LICENCE template", () => {
    const result = buildEmail("UNKNOWN_TYPE", "Test Ltd", null, null);
    expect(result.subject).toContain("added");
  });

  it("escapes HTML in organisation name", () => {
    const result = buildEmail("NEW_LICENCE", "<script>alert('xss')</script>", null, null);
    expect(result.html).toContain("&lt;");
    expect(result.html).not.toContain("<script>");
  });

  it("escapes previous and new values", () => {
    const result = buildEmail("UPGRADED", "Safe Ltd", "<b>Bad</b>", "<i>Also Bad</i>");
    expect(result.html).toContain("&lt;b&gt;");
    expect(result.html).toContain("&lt;i&gt;");
    expect(result.html).not.toContain("<b>Bad</b>");
  });

  it("returns HTML with basic structure (heading, footer, link)", () => {
    const result = buildEmail("NEW_LICENCE", "Test Ltd", null, null);
    expect(result.html).toContain("<div");
    expect(result.html).toContain("</div>");
    expect(result.html).toContain("checkbyai.net/dashboard/sponsor");
  });

  it("handles no previous/next values gracefully", () => {
    const result = buildEmail("REMOVED_REVOKED", "Acme Ltd", null, null);
    expect(result.subject).toContain("Acme Ltd");
    expect(result.html).not.toContain("null");
    expect(result.html).not.toContain("undefined");
  });
});

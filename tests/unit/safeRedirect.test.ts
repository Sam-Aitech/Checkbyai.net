import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../../shared/safeRedirect";

describe("safeRedirectPath: legitimate destinations", () => {
  it.each([
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/sponsor-monitor?q=acme%20ltd&alert=1", "/sponsor-monitor?q=acme%20ltd&alert=1"],
    ["/dashboard/sponsor?company=A%26B", "/dashboard/sponsor?company=A%26B"],
    ["/a/b/../c", "/a/c"],
    ["/path#section", "/path#section"],
    ["/search?next=/inner", "/search?next=/inner"],
    ["/search?u=https://example.com", "/search?u=https://example.com"],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("safeRedirectPath: exotic but same-origin input", () => {
  it("percent-encodes unusual characters and stays on the same origin", () => {
    const out = safeRedirectPath("/\u2028/evil.example", "/safe");
    expect(out).toBe("/%E2%80%A8/evil.example");
    expect(new URL(out as string, "https://app.invalid").origin).toBe("https://app.invalid");
  });
});

describe("safeRedirectPath: bypass attempts return the fallback", () => {
  const bypasses: Array<[string, unknown]> = [
    ["protocol-relative", "//evil.example"],
    ["protocol-relative with path", "//evil.example/login"],
    ["triple slash", "///evil.example"],
    ["backslash after slash", "/\\evil.example"],
    ["leading backslashes", "\\\\evil.example"],
    ["backslash anywhere", "/ok\\..\\evil"],
    ["absolute https", "https://evil.example"],
    ["absolute http", "http://evil.example/x"],
    ["scheme without slashes", "https:evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["mailto", "mailto:a@b.c"],
    ["credentials", "https://user:pw@evil.example"],
    ["credentials in protocol-relative", "//user:pw@evil.example"],
    ["no leading slash", "evil.example"],
    ["relative", "../../evil"],
    ["encoded double slash", "/%2f/evil.example"],
    ["encoded double slash upper", "/%2F/evil.example"],
    ["encoded backslash", "/%5cevil.example"],
    ["encoded backslash upper", "/%5Cevil.example"],
    ["doubly encoded slash", "/%252f/evil.example"],
    ["triply encoded backslash", "/%25255cevil.example"],
    ["encoded protocol-relative", "%2f%2fevil.example"],
    ["tab inside", "/\t/evil.example"],
    ["encoded tab", "/%09/evil.example"],
    ["newline", "/\n/evil.example"],
    ["encoded newline", "/%0a/evil.example"],
    ["carriage return", "/\r/evil.example"],
    ["NUL byte", "/\u0000/evil.example"],
    ["encoded NUL", "/%00/evil.example"],
    ["dot-segment collapse to //", "/a/..//evil.example"],
    ["dot-segment collapse encoded", "/a/%2e%2e//evil.example"],
    ["leading space", " //evil.example"],
    ["malformed percent escape", "/%E0%A4%A"],
    ["empty", ""],
    ["only whitespace", "   "],
    ["too long", "/" + "a".repeat(3000)],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["array", ["/ok"]],
    ["object", { toString: () => "/ok" }],
  ];

  it.each(bypasses)("%s", (_label, input) => {
    expect(safeRedirectPath(input, "/safe")).toBe("/safe");
    expect(safeRedirectPath(input)).toBeNull();
  });

  it("never returns a value a browser would treat as another origin", () => {
    for (const [, input] of bypasses) {
      const out = safeRedirectPath(input, "/safe");
      expect(out).toMatch(/^\/(?![/\\])/);
      expect(new URL(out as string, "https://app.invalid").origin).toBe("https://app.invalid");
    }
  });
});

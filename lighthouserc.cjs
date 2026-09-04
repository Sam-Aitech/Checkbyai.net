// Lighthouse CI — Proof 7 lab evidence + regression guard.
// Run: BASE_URL=https://staging.checkbyai.net npx @lhci/cli autorun
// Asserts Core Web Vitals on the three highest-traffic routes.
module.exports = {
  ci: {
    collect: {
      url: [
        `${process.env.BASE_URL || "http://localhost:5000"}/`,
        `${process.env.BASE_URL || "http://localhost:5000"}/sponsor-directory`,
        `${process.env.BASE_URL || "http://localhost:5000"}/sponsor-changes`,
      ],
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        onlyCategories: ["performance"],
      },
    },
    assert: {
      assertions: {
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "interaction-to-next-paint": ["warn", { maxNumericValue: 300 }],
        "total-blocking-time": ["warn", { maxNumericValue: 400 }],
        "errors-in-console": ["warn", { maxLength: 0 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "docs/perf-evidence/lhci",
    },
  },
};

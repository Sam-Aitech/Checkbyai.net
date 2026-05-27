import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import securityPlugin from "eslint-plugin-security";

const securityRules = Object.fromEntries(
  Object.keys(securityPlugin.rules).map((ruleName) => [`security/${ruleName}`, "error"]),
);

const baseTsLanguageOptions = {
  parser: tsParser,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
};

const baseTsPlugins = {
  "@typescript-eslint": tsPlugin,
  security: securityPlugin,
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["server/**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ...baseTsLanguageOptions,
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        global: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
      },
    },
    plugins: baseTsPlugins,
    rules: {},
  },
  {
    files: ["client/**/*.{ts,tsx,mts,cts}"],
    ignores: ["client/src/components/CompanyIntelligencePanel.tsx", "client/src/pages/SimpleAdmin.tsx"],
    languageOptions: {
      ...baseTsLanguageOptions,
      globals: {
        Blob: "readonly",
        Document: "readonly",
        Event: "readonly",
        File: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLElement: "readonly",
        MouseEvent: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Window: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        sessionStorage: "readonly",
        window: "readonly",
      },
    },
    plugins: baseTsPlugins,
    rules: {},
  },
  {
    files: ["server/routes/**/*.{ts,tsx,mts,cts}", "server/utils/**/*.{ts,tsx,mts,cts}"],
    ignores: ["server/routes/**/__tests__/**", "server/utils/**/__tests__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      security: securityPlugin,
    },
    rules: {
      ...securityRules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
    },
  },
  {
    files: [
      "server/routes/admin.ts",
      "server/routes/auth.ts",
      "server/routes/billing.ts",
      "server/routes/enrichment.ts",
      "server/routes/feedback.ts",
      "server/routes/notifications.ts",
      "server/routes/ops.ts",
      "server/routes/seo.ts",
      "server/routes/sponsorPages.ts",
      "server/routes/sponsors.ts",
      "server/routes/support.ts",
      "server/routes/verification.ts",
      "server/utils/binaryRunner.ts",
      "server/utils/companyEnricher.ts",
      "server/utils/csvArchiver.ts",
      "server/utils/csvFingerprintBuilder.ts",
      "server/utils/enrichmentWorker.ts",
      "server/utils/jobAlertJob.ts",
      "server/utils/jobScraper.ts",
      "server/utils/notificationDispatcher.ts",
      "server/utils/resilientEmail.ts",
      "server/utils/scheduler.ts",
      "server/utils/shadowMode.ts",
      "server/utils/sponsorListFetcher.ts",
      "server/utils/sponsorMonitorJob.ts",
      "server/utils/sponsorSearch.ts",
      "server/utils/tierConfig.ts",
      "server/utils/uploadGuard.ts",
    ],
    rules: {
      // Temporary carve-out for pre-existing legacy code while keeping strict rules for new code.
      "@typescript-eslint/no-explicit-any": "off",
      // Temporary carve-out for pre-existing legacy code while keeping strict rules for new code.
      "@typescript-eslint/no-unsafe-assignment": "off",
      // Temporary carve-out for pre-existing legacy code while keeping strict rules for new code.
      "@typescript-eslint/no-unsafe-member-access": "off",
      // Temporary carve-out for pre-existing dynamic key access patterns in legacy modules.
      "security/detect-object-injection": "off",
      // Temporary carve-out for pre-existing non-literal fs filename patterns in legacy modules.
      "security/detect-non-literal-fs-filename": "off",
    },
  },
];

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import securityPlugin from "eslint-plugin-security";

const securityRules = Object.fromEntries(
  Object.keys(securityPlugin.rules).map((ruleName) => [`security/${ruleName}`, "error"]),
);

const baseTsLanguageOptions = {
  parser: tsParser,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: import.meta.dirname,
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
    rules: {
      ...securityRules,
    },
  },
  {
    files: ["client/**/*.{ts,tsx,mts,cts}"],
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
    rules: {
      ...securityRules,
    },
  },
  {
    files: ["server/routes/**/*.{ts,tsx,mts,cts}", "server/utils/**/*.{ts,tsx,mts,cts}"],
    ignores: ["server/routes/**/__tests__/**", "server/utils/**/__tests__/**"],
    languageOptions: baseTsLanguageOptions,
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
    },
  },
];

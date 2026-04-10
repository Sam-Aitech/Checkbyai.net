import { defineConfig } from "vitest/config";
import path from "path";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://dummy:dummy@localhost:5432/dummy";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/__tests__/**/*.test.ts"],
    // Each file gets its own isolated module context (important for env-var tests)
    isolate: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@uicogs/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@uicogs/auth": fileURLToPath(new URL("./packages/auth/src/index.ts", import.meta.url)),
      "@uicogs/http": fileURLToPath(new URL("./packages/http/src/index.ts", import.meta.url)),
      "@uicogs/vue": fileURLToPath(new URL("./packages/vue/src/index.ts", import.meta.url)),
      "@uicogs/react": fileURLToPath(new URL("./packages/react/src/index.ts", import.meta.url)),
      "@uicogs/quasar": fileURLToPath(new URL("./packages/quasar/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        "packages/core/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "packages/auth/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "packages/http/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/storage/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/vue/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/vue-router/src/**": {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85,
        },
        "packages/react/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/quasar/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/openapi/src/**": { lines: 90, statements: 90, functions: 90, branches: 85 },
        "packages/legacy/src/**": { lines: 85, statements: 85, functions: 85, branches: 80 },
      },
    },
  },
});

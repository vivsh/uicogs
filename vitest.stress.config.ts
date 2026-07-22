import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@uicogs/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/stress/**/*.stress.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// טוען את env של הטסטים
dotenv.config({ path: ".env.test" });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});

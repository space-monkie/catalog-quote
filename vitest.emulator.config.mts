import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against the Firebase Emulator Suite: `npm run test:rules`
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 👇 enable DOM APIs (like document) for testing
    environment: "jsdom",
    // 👇 enable vitest's globals (describe, it, expect, etc.)
    globals: true,
    // 👇 look for test files in the 'src' directory
    include: ["src/**/*.test.ts"],
    setupFiles: "./src/tests/setup.ts", // optional setup file
  },
});

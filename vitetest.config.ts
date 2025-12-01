// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node", // ← Changed from "jsdom" to "node"
    
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      
      // Optional: Exclude files you don't want in coverage
      exclude: [
        "node_modules/",
        "out/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "test/**",
        "coverage/**"
      ]
    },
  },
});

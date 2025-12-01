import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/out/**",          // ← Critical: exclude compiled files
      "**/dist/**",
      "**/coverage/**"
    ],
    
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      
      exclude: [
        "node_modules/",
        "out/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "test/**",
        "coverage/**"
      ]
    },
  },
});

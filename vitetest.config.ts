// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    // ... other settings

    // 👇 ADD THIS COVERAGE SECTION
    coverage: {
      // Choose the provider
      provider: "v8",
      // Specify the reporters, including 'html'
      reporter: ["text", "json", "html"],
      // The directory where reports will be generated
      reportsDirectory: "./coverage",
    },
  },
});

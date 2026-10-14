import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts on purpose: that file fills the manifest
// from .env and rejects missing values, none of which a unit test needs.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

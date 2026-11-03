import { describe, expect, it } from "vitest";
import { isModelKeyConfigured, isOnboardingComplete } from "../utils/onboarding";

// The Groq preset every install starts with: endpoint and model, no key.
const preset = { customBaseUrl: "https://api.groq.com/openai/v1", customModel: "llama-3.3-70b-versatile", customKey: "" };

describe("isModelKeyConfigured", () => {
  it("counts a backend-proxied provider as set up: the key lives on the server", () => {
    for (const provider of ["gemini", "groq", "anthropic", "openrouter"] as const) {
      expect(isModelKeyConfigured({ provider, ...preset })).toBe(true);
    }
  });

  it("requires endpoint, model and key for Custom, so the bare Groq preset doesn't count", () => {
    expect(isModelKeyConfigured({ provider: "custom", ...preset })).toBe(false);
    expect(isModelKeyConfigured({ provider: "custom", ...preset, customKey: "k" })).toBe(true);
    expect(isModelKeyConfigured({ provider: "custom", ...preset, customBaseUrl: "", customKey: "k" })).toBe(false);
  });
});

describe("isOnboardingComplete", () => {
  it("doesn't need an integration, only a usable model and a KB entry", () => {
    expect(isOnboardingComplete({ provider: "gemini", ...preset }, 1)).toBe(true);
    expect(isOnboardingComplete({ provider: "gemini", ...preset }, 0)).toBe(false);
    expect(isOnboardingComplete({ provider: "custom", ...preset }, 3)).toBe(false);
  });
});

// A default model the backend rejects out of the box (400) should fail here,
// not in a live call. The allowlist is read from backend/api/routes/llm.py.
import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ provider: "anthropic" }));
vi.mock("../utils/settings-storage", () => ({ getSettings: () => settings, bumpUsage: () => {} }));

import { resolveLLMConfig, type LLMProvider } from "../agents/llm-client";
import { backendDefaultAllowlist } from "./backend-allowlist";

const PROXIED: LLMProvider[] = ["anthropic", "gemini", "groq", "openrouter"];

describe("extension default models vs the backend allowlist", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // A developer's extension/.env may override these; test the built-in defaults.
    vi.stubEnv("VITE_GEMINI_MODEL", undefined);
    vi.stubEnv("VITE_OPENROUTER_MODEL", undefined);
    vi.stubEnv("VITE_LLM_PROVIDER", undefined);
  });

  it("parses an allowlist for every proxied provider", () => {
    const allow = backendDefaultAllowlist();
    for (const p of PROXIED) expect(allow[p]?.length, p).toBeGreaterThan(0);
  });

  it.each(PROXIED)("default %s model is allowed by default", (provider) => {
    settings.provider = provider;
    const cfg = resolveLLMConfig();
    expect("error" in cfg).toBe(false);
    if ("error" in cfg) return;
    expect(cfg.provider).toBe(provider);
    expect(backendDefaultAllowlist()[provider]).toContain(cfg.model);
  });
});

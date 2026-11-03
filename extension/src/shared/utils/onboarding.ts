/**
 * Onboarding checklist rules, shared by the checklist card and App's
 * "set up" state so the two can't disagree.
 */

import type { UserSettings } from "./settings-storage";

// Providers whose key lives on the backend: nothing to add in the extension.
const SERVER_KEY_PROVIDERS = new Set(["gemini", "groq", "anthropic", "openrouter"]);

/**
 * True when the active provider can make calls. Backend-proxied providers
 * hold their key on the server and Ollama runs locally without one; Custom
 * needs an endpoint, a model and a key. The Groq preset fills the Custom
 * endpoint and model on every install, so those alone don't count.
 */
export function isModelKeyConfigured(s: Pick<UserSettings, "provider" | "customBaseUrl" | "customModel" | "customKey">): boolean {
  if (SERVER_KEY_PROVIDERS.has(s.provider) || s.provider === "ollama") return true;
  return !!s.customBaseUrl && !!s.customModel && !!s.customKey;
}

/** Complete once a model is usable and the KB has an entry. The integration step is optional. */
export function isOnboardingComplete(
  s: Pick<UserSettings, "provider" | "customBaseUrl" | "customModel" | "customKey">,
  kbCount: number,
): boolean {
  return isModelKeyConfigured(s) && kbCount > 0;
}

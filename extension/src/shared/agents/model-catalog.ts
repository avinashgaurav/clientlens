import type { LLMProvider } from "./llm-client";

export interface ModelOption {
  provider: LLMProvider;
  model: string;
  label: string;
  tier: "free" | "cheap" | "premium";
  note: string;
}

// Ordered cheap → expensive. Free tier first.
export const MODEL_CATALOG: ModelOption[] = [
  // ─── FREE ─────────────────────────────────────────
  {
    provider: "gemini",
    model: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    tier: "free",
    note: "Free · recommended · the only Gemini model a new key can call",
  },
  {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (Groq)",
    tier: "free",
    note: "Free · 12k TPM · alternative if you have no Gemini key",
  },
  {
    provider: "groq",
    model: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B (Groq)",
    tier: "free",
    note: "Free · fastest tokens/sec · light reasoning",
  },
  // Everything below needs a Gemini key that predates Google's cutover. A key
  // created today 404s on all of them with "no longer available to new users";
  // only gemini-3.6-flash above works. Kept because older keys still use them.
  {
    provider: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "free",
    note: "Free · fast · existing Gemini key only",
  },
  {
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    tier: "free",
    note: "Free · cheaper and faster · existing Gemini key only",
  },
  {
    provider: "gemini",
    model: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash (legacy)",
    tier: "free",
    note: "Retired for new keys · keep only if it already works for you",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B (OpenRouter)",
    tier: "free",
    note: "Free · OpenAI open-source · validated in smoke test",
  },
  {
    provider: "openrouter",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    label: "Llama 3.1 8B (OpenRouter)",
    tier: "free",
    note: "Free · fast 8B · used automatically for live copilot agents",
  },
  {
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (OpenRouter)",
    tier: "free",
    note: "Free · OpenRouter gateway · often rate-limited",
  },
  {
    provider: "openrouter",
    model: "deepseek/deepseek-chat:free",
    label: "DeepSeek Chat (OpenRouter)",
    tier: "free",
    note: "Free · strong reasoning · OpenRouter free pool",
  },

  // ─── PREMIUM ──────────────────────────────────────
  {
    provider: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tier: "premium",
    note: "Paid · highest Gemini quality · existing Gemini key only",
  },
  {
    provider: "gemini",
    model: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro (legacy)",
    tier: "premium",
    note: "Retired for new keys · existing Gemini key only",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    tier: "premium",
    note: "Paid · cheapest Claude · very fast",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    tier: "premium",
    note: "Paid · balanced quality / cost",
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    tier: "premium",
    note: "Paid · highest quality, slowest",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    label: "GPT-4o mini (OpenRouter)",
    tier: "cheap",
    note: "Paid · cheap · OpenRouter gateway",
  },
  {
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet (OpenRouter)",
    tier: "premium",
    note: "Paid · routed via OpenRouter (use direct Anthropic for lower latency)",
  },
];

const STORAGE_KEY = "clientlens_llm_override";

export interface ModelOverride {
  provider: LLMProvider;
  model: string;
}

export function getStoredModel(): ModelOverride | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ModelOverride) : null;
  } catch {
    return null;
  }
}

export function setStoredModel(override: ModelOverride | null): void {
  try {
    if (override) localStorage.setItem(STORAGE_KEY, JSON.stringify(override));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

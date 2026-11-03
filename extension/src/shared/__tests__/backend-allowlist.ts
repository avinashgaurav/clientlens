// Test helper: the backend's default model allowlists, read from
// backend/api/routes/llm.py. The backend answers 400 for any model outside
// them, so extension defaults are checked against this in tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LLM_PY = readFileSync(resolve(__dirname, "../../../../backend/api/routes/llm.py"), "utf8");

const quoted = (block: string) => [...block.replace(/#.*$/gm, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** Default allowlist per proxied provider (anthropic, groq, openrouter, gemini). */
export function backendDefaultAllowlist(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const dict = LLM_PY.match(/_DEFAULT_ALLOWED_MODELS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const m of dict.matchAll(/"(\w+)":\s*frozenset\(\{([\s\S]*?)\}\)/g)) out[m[1]] = quoted(m[2]);
  const gemini = LLM_PY.match(/_ALLOWED_GEMINI_MODELS[^=]*=\s*frozenset\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  out.gemini = quoted(gemini);
  return out;
}

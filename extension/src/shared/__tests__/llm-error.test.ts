import { describe, expect, it } from "vitest";
import { friendlyLLMError } from "../agents/llm-client";

const body = (detail: unknown) => JSON.stringify({ detail });

describe("friendlyLLMError", () => {
  it("shows the backend's own 429 and 503 details as written", () => {
    const cases: [number, string][] = [
      [429, "Daily token budget exceeded (1000000/1000000 used). Resets at UTC 00:00."],
      [429, "ClientLens has reached today's overall usage limit. It resets at UTC 00:00."],
      [429, "Too many requests at once. Wait for one to finish."],
      [503, "Usage check is unavailable right now. Try again in a minute."],
      [503, "The AI models are busy or used up for today. Try again later."],
    ];
    for (const [status, detail] of cases) {
      const err = friendlyLLMError("Gemini (proxy)", status, body(detail));
      expect(err.message).toBe(detail);
      expect((err as Error & { status?: number }).status).toBe(status);
    }
  });

  it("keeps the generic quota text when there is no usable detail", () => {
    const generic = "Gemini (proxy) rate limit or quota hit. Wait a moment or switch provider in Settings.";
    expect(friendlyLLMError("Gemini (proxy)", 429, "").message).toBe(generic);
    expect(friendlyLLMError("Gemini (proxy)", 429, "not json").message).toBe(generic);
    expect(friendlyLLMError("Gemini (proxy)", 429, body({ error: "upstream_error" })).message).toBe(generic);
    expect(friendlyLLMError("Gemini (proxy)", 429, body('Gemini 429: {"error":{"code":429}}')).message).toBe(generic);
    expect(friendlyLLMError("Gemini (proxy)", 429, body("Error code: 429 - rate_limit_error")).message).toBe(generic);
    expect(friendlyLLMError("Gemini (proxy)", 503, body("x".repeat(201))).message).not.toBe("x".repeat(201));
  });

  it("leaves other statuses on the existing mapping", () => {
    expect(friendlyLLMError("Gemini (proxy)", 401, body("Invalid or expired token")).message).toContain("API key is invalid");
    expect(friendlyLLMError("Gemini (proxy)", 400, body("Unsupported Gemini model: x")).message).toMatch(/^Gemini \(proxy\) 400: /);
  });
});

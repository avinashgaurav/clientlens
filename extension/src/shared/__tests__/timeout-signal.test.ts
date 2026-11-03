import { describe, expect, it, vi } from "vitest";
import { TIMEOUT_MESSAGE, timeoutSignal } from "../agents/llm-client";

describe("timeoutSignal", () => {
  it("aborts with a readable message once the time is up", async () => {
    vi.useFakeTimers();
    const signal = timeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe(TIMEOUT_MESSAGE);
    vi.useRealTimers();
  });

  it("makes fetch reject with that message", async () => {
    const signal = AbortSignal.abort(new Error(TIMEOUT_MESSAGE));
    await expect(fetch("https://example.invalid", { signal })).rejects.toThrow(TIMEOUT_MESSAGE);
  });
});

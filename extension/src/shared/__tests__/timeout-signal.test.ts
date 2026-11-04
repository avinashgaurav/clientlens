import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBED_TIMEOUT_MESSAGE, LIVE_TIMEOUT_MS, TIMEOUT_MESSAGE, timeoutSignal } from "../agents/llm-client";

describe("timeoutSignal", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("aborts with a readable message once the time is up", () => {
    const signal = timeoutSignal(1000);
    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe(TIMEOUT_MESSAGE);
  });

  it("makes a request made with it fail with that message", async () => {
    const signal = timeoutSignal(1000, EMBED_TIMEOUT_MESSAGE);
    vi.advanceTimersByTime(1000);
    await expect(fetch("https://example.invalid", { signal })).rejects.toThrow(EMBED_TIMEOUT_MESSAGE);
  });

  it("live calls fail faster than background work", () => {
    expect(LIVE_TIMEOUT_MS).toBeLessThan(120_000);
  });
});

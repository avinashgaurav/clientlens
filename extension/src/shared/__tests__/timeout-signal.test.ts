import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBED_TIMEOUT_MESSAGE, LIVE_TIMEOUT_MS, TIMEOUT_MESSAGE, timeoutSignal, withTimeout } from "../agents/llm-client";

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

  it("a caller abort stays distinct from the timeout", () => {
    const caller = new AbortController();
    const combined = withTimeout(caller.signal, 1000);
    caller.abort();
    expect(combined.aborted).toBe(true);
    expect((combined.reason as Error).message).not.toBe(TIMEOUT_MESSAGE);
  });

  it("the timeout fires through the combined signal", () => {
    const combined = withTimeout(new AbortController().signal, LIVE_TIMEOUT_MS);
    vi.advanceTimersByTime(LIVE_TIMEOUT_MS);
    expect((combined.reason as Error).message).toBe(TIMEOUT_MESSAGE);
  });
});

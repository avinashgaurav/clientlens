import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agents = vi.hoisted(() => ({
  runSentimentAgent: vi.fn(),
  runAgendaTracker: vi.fn(),
  runCoachAgent: vi.fn(),
  runLiveCouncilValidator: vi.fn(),
}));
const store = vi.hoisted(() => {
  const state = {
    session: { status: "listening", transcript: [], sentiment_history: [] } as Record<string, unknown> | null,
    setStatus: vi.fn(),
  };
  return { getState: () => state, subscribe: () => () => {} };
});

vi.mock("../agents/live-agents", () => agents);
vi.mock("../../sidebar/stores/meeting-copilot-store", () => ({ useMeetingCopilotStore: store }));

import { resumeLiveAgents, startLiveOrchestrator, stopLiveOrchestrator } from "../agents/live-orchestrator";
import { classifyRateLimit } from "../agents/live-helpers";

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });
const DAILY = "Daily token budget exceeded (1000000/1000000 used). Resets at UTC 00:00.";
const calls = () =>
  agents.runSentimentAgent.mock.calls.length + agents.runAgendaTracker.mock.calls.length + agents.runCoachAgent.mock.calls.length;

describe("classifyRateLimit", () => {
  it("treats a spent daily budget as a session-long stop", () => {
    expect(classifyRateLimit(withStatus(DAILY, 429))).toBe("daily");
    expect(classifyRateLimit(withStatus("ClientLens has reached today's overall usage limit. It resets at UTC 00:00.", 429))).toBe("daily");
    expect(classifyRateLimit(withStatus("The AI models are busy or used up for today. Try again later.", 503))).toBe("daily");
  });

  it("treats other 429s as a short cooldown", () => {
    expect(classifyRateLimit(withStatus("Too many requests at once. Wait for one to finish.", 429))).toBe("burst");
    expect(classifyRateLimit(new Error("Gemini (proxy) rate limit or quota hit. Wait a moment or switch provider in Settings."))).toBe("burst");
    expect(classifyRateLimit(new Error("network down"))).toBeNull();
  });
});

describe("live orchestrator rate limits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.getState().setStatus.mockClear();
    for (const fn of Object.values(agents)) fn.mockReset();
  });
  afterEach(() => {
    stopLiveOrchestrator();
    vi.useRealTimers();
  });

  function failEveryCallWith(err: Error) {
    agents.runSentimentAgent.mockRejectedValue(err);
    agents.runAgendaTracker.mockRejectedValue(err);
    agents.runCoachAgent.mockRejectedValue(err);
  }

  it("stops all agents for the session on a daily-budget 429 and reports it once", async () => {
    failEveryCallWith(withStatus(DAILY, 429));
    startLiveOrchestrator(() => []);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls()).toBe(1);
    expect(store.getState().setStatus).toHaveBeenCalledTimes(1);
    expect(store.getState().setStatus).toHaveBeenCalledWith("listening", DAILY);

    resumeLiveAgents();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls()).toBe(2);
  });

  it("keeps retrying after the 25 s cooldown on an ordinary 429", async () => {
    failEveryCallWith(withStatus("Too many requests at once. Wait for one to finish.", 429));
    startLiveOrchestrator(() => []);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls()).toBeGreaterThan(10);
    expect(store.getState().setStatus).not.toHaveBeenCalled();
  });
});

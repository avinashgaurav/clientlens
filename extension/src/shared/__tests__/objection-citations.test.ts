import { describe, expect, it } from "vitest";
import { parseCitationMarkers } from "../utils/objection-citations";

const cites = [
  { source_id: "kb-a", quote: "a" },
  { source_id: "kb-b", quote: "b" },
];

describe("parseCitationMarkers", () => {
  it("returns empty_response for a blank response", () => {
    expect(parseCitationMarkers({ response: "", citations: cites })).toEqual({
      tokens: [],
      parseFallback: false,
      reason: "empty_response",
    });
  });

  it("renders literally with no citations", () => {
    const r = parseCitationMarkers({ response: "Hello [1]", citations: [] });
    expect(r).toEqual({ tokens: [{ kind: "text", value: "Hello [1]" }], parseFallback: false, reason: "no_citations" });
  });

  it("falls back when citations exist but no markers do", () => {
    const r = parseCitationMarkers({ response: "No markers here.", citations: cites });
    expect(r.parseFallback).toBe(true);
    expect(r.reason).toBe("no_markers");
  });

  it("tokenizes valid markers in order with their source ids", () => {
    const r = parseCitationMarkers({ response: "Fast [1] and safe [2].", citations: cites });
    expect(r.reason).toBe("ok");
    expect(r.tokens).toEqual([
      { kind: "text", value: "Fast " },
      { kind: "marker", index: 1, sourceId: "kb-a" },
      { kind: "text", value: " and safe " },
      { kind: "marker", index: 2, sourceId: "kb-b" },
      { kind: "text", value: "." },
    ]);
  });

  it("allows the same source to be cited twice", () => {
    const r = parseCitationMarkers({ response: "[1] x [1]", citations: cites });
    expect(r.reason).toBe("ok");
    expect(r.tokens.filter((t) => t.kind === "marker")).toHaveLength(2);
  });

  it("keeps a minority of out-of-bounds markers as literal text", () => {
    const r = parseCitationMarkers({ response: "a [1] b [2] c [1] d [9]", citations: cites });
    // 1 of 4 invalid = 25%, under the 30% threshold.
    expect(r.parseFallback).toBe(false);
    expect(r.reason).toBe("ok_with_literals");
    expect(r.tokens).toContainEqual({ kind: "text", value: "[9]" });
  });

  it("falls back entirely when more than 30% of markers are invalid", () => {
    const r = parseCitationMarkers({ response: "a [1] b [0] c [7]", citations: cites });
    expect(r.parseFallback).toBe(true);
    expect(r.reason).toBe("out_of_bounds");
    expect(r.tokens).toEqual([{ kind: "text", value: "a [1] b [0] c [7]" }]);
  });
});

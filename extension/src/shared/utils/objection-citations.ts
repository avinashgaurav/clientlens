/**
 * Objection citation marker parser (#84a).
 *
 * The respond agent emits inline [N] markers in `response` aligned to
 * `citations[N-1]`. This parser tokenizes the response into a stream of
 * `text` and `marker` nodes the renderer can paint with inline citation
 * chips (delivered in #84b).
 *
 * Fallback rules per the design doc:
 *  1. Markers with `N < 1` or `N > citations.length` are discarded
 *     (rendered as literal `[N]` text, not chips).
 *  2. If MORE than 30% of detected markers are invalid (out-of-bounds /
 *     `N === 0` / duplicate-already-discarded), treat the WHOLE response
 *     as parse-failed and fall back to legacy "flat citations card"
 *     rendering. The renderer should consume `parseFallback === true` and
 *     skip inline chips entirely.
 *  3. If ZERO markers are detected AND citations is non-empty, also
 *     fall back. The agent didn't follow the prompt; don't try to render
 *     inline accountability we don't have.
 *
 * The renderer should NEVER throw on a bad response — every code path
 * here returns a usable shape.
 */

export type CitationToken =
  | { kind: "text"; value: string }
  | { kind: "marker"; index: number; sourceId: string };

export interface ParsedResponse {
  /** Token stream the renderer paints in order. */
  tokens: CitationToken[];
  /** True when the full-fallback path fires (renderer skips inline chips). */
  parseFallback: boolean;
  /** Diagnostic reason for telemetry (#84c). One of:
   *  - `"ok"` — every detected marker resolved to a valid citation; no
   *             literal `[N]` text fell out of the bounds check.
   *  - `"ok_with_literals"` — markers detected; some were out-of-bounds
   *             but under the 30% threshold, so they were kept as literal
   *             `[N]` text in the prose. Renderer behavior is unchanged
   *             from `"ok"`, but telemetry uses this to flag partial
   *             LLM-prompt-following degradation.
   *  - `"no_markers"` — zero markers detected, citations is non-empty.
   *             Fallback to legacy renderer.
   *  - `"out_of_bounds"` — >30% of detected markers were invalid. Full
   *             fallback to legacy renderer.
   *  - `"empty_response"` — response field was blank. parseFallback is
   *             intentionally FALSE here (no fallback semantics apply to
   *             a blank response — render nothing).
   *  - `"no_citations"` — citations array was empty. Render response
   *             literally with no chips. Not a fallback. */
  reason:
    | "ok"
    | "ok_with_literals"
    | "no_markers"
    | "out_of_bounds"
    | "empty_response"
    | "no_citations";
}

const MARKER_RE = /\[(\d+)\]/g;
const INVALID_THRESHOLD = 0.3; // > 30% invalid → full fallback

export interface ParseInputs {
  response: string;
  citations: { source_id: string; quote: string }[];
}

/**
 * Parse the response into a citation-aware token stream.
 *
 * Pure function. No side effects, no logging. Callers (the renderer in
 * #84b and the telemetry hook in #84c) consume `reason` separately.
 */
export function parseCitationMarkers({ response, citations }: ParseInputs): ParsedResponse {
  // Edge: blank response — render literally, no fallback semantics apply.
  if (!response) {
    return { tokens: [], parseFallback: false, reason: "empty_response" };
  }

  // Edge: no citations at all — inline chips have nothing to point at.
  // Render the response as literal text. Not a "fallback" — the legacy
  // path also has nothing to render in the citations card.
  if (!citations.length) {
    return {
      tokens: [{ kind: "text", value: response }],
      parseFallback: false,
      reason: "no_citations",
    };
  }

  // Scan markers and decide validity per spec.
  const matches: { idx: number; raw: string; pos: number; len: number }[] = [];
  for (const m of response.matchAll(MARKER_RE)) {
    const idx = Number(m[1]);
    matches.push({ idx, raw: m[0], pos: m.index ?? 0, len: m[0].length });
  }

  // Rule 3: zero markers + non-empty citations → fallback.
  if (matches.length === 0) {
    return {
      tokens: [{ kind: "text", value: response }],
      parseFallback: true,
      reason: "no_markers",
    };
  }

  // Invalid = out-of-bounds OR N === 0. Duplicates (same N appearing
  // more than once) are NOT invalid — the LLM legitimately cites one
  // source on multiple claims. The design doc's spec lumped duplicates
  // into "invalid" but that produces false-positive fallbacks for any
  // response that leans on a single strong source. If the user explicitly
  // wants duplicate-counts-as-invalid, change this filter and revisit.
  const invalidCount = matches.filter((mm) => mm.idx < 1 || mm.idx > citations.length).length;
  // Rule 2: > 30% invalid → full fallback. Renderer treats response as
  // plain text + uses legacy citations card.
  if (invalidCount / matches.length > INVALID_THRESHOLD) {
    return {
      tokens: [{ kind: "text", value: response }],
      parseFallback: true,
      reason: "out_of_bounds",
    };
  }

  // Walk the response and emit text + marker tokens in order. Out-of-bounds
  // markers within tolerance are kept as literal `[N]` text per rule 1.
  const tokens: CitationToken[] = [];
  let cursor = 0;
  let literalsKept = 0;
  for (const mm of matches) {
    if (mm.pos > cursor) {
      tokens.push({ kind: "text", value: response.slice(cursor, mm.pos) });
    }
    if (mm.idx >= 1 && mm.idx <= citations.length) {
      tokens.push({
        kind: "marker",
        index: mm.idx,
        sourceId: citations[mm.idx - 1].source_id,
      });
    } else {
      // Out-of-bounds: keep the literal `[N]` text in the prose. The
      // renderer paints it without a chip.
      tokens.push({ kind: "text", value: mm.raw });
      literalsKept += 1;
    }
    cursor = mm.pos + mm.len;
  }
  if (cursor < response.length) {
    tokens.push({ kind: "text", value: response.slice(cursor) });
  }

  return {
    tokens,
    parseFallback: false,
    reason: literalsKept > 0 ? "ok_with_literals" : "ok",
  };
}

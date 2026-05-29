import React, { useEffect, useMemo, useRef, useState } from "react";
import { Shield, Copy, ArrowLeft, Zap, AlertTriangle } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { useObjection } from "../hooks/useObjection";
import { useObjectionComposerV2 } from "../hooks/useObjectionComposerV2";
import type { ObjectionInput, ObjectionResponse } from "../../shared/types";
import { parseCitationMarkers, type ParsedResponse } from "../../shared/utils/objection-citations";
import { track } from "../../shared/utils/telemetry";

// Strip [N] markers when copying so reps paste a clean reply into
// Slack/email. Markers are an in-product reasoning signal, not a deliverable.
// Strips the marker + any trailing whitespace it introduced, but preserves
// the whitespace that came BEFORE the marker (otherwise newlines and
// inter-word spaces collapse).
//
// Edge: for adjacent markers like "text [1] [2] more", the first match's
// `\s*` consumes the space between [1] and [2], so the output is
// "text more" with one space (not two). This is acceptable for copy —
// the prose still reads cleanly. If a future spec wants exact spacing
// preservation, replace with a two-pass: strip markers first, then
// collapse runs of whitespace to single spaces.
function stripCitationMarkers(text: string): string {
  return text.replace(/\[\d+\]\s*/g, "").trimEnd();
}

export function ObjectionPanel() {
  const {
    objectionInput,
    setObjectionInput,
    lastObjection,
    setLastObjection,
    isGenerating,
  } = useAppStore();
  const { run } = useObjection();

  const [text, setText] = useState(objectionInput?.objection_text ?? "");
  const [competitor, setCompetitor] = useState(objectionInput?.competitor_hint ?? "");
  const [copied, setCopied] = useState(false);

  // Hook MUST be called at the top of the component (React rules of hooks),
  // unconditionally — see comment block in useObjectionComposerV2.ts.
  const composerV2 = useObjectionComposerV2();

  // Time-to-copy measurement: stamp when a new result lands; emit a
  // timing event on copy. Reset stamp when the rep clicks "New objection".
  const resultReadyAt = useRef<number | null>(null);
  useEffect(() => {
    if (lastObjection) {
      resultReadyAt.current = Date.now();
    } else {
      resultReadyAt.current = null;
    }
  }, [lastObjection]);

  // Pick up context-menu captures routed via chrome.storage.session.
  useEffect(() => {
    chrome.storage.session.get("pending_objection").then((data) => {
      const pending = data.pending_objection as ObjectionInput | undefined;
      if (pending?.objection_text) {
        setText(pending.objection_text);
        setObjectionInput(pending);
        chrome.storage.session.remove("pending_objection");
      }
    });

    const handler = (message: { type: string; payload?: ObjectionInput }) => {
      if (message.type === "OBJECTION_CAPTURE" && message.payload?.objection_text) {
        setText(message.payload.objection_text);
        setObjectionInput(message.payload);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [setObjectionInput]);

  async function handleSubmit() {
    if (!text.trim()) return;
    setObjectionInput({
      objection_text: text.trim(),
      competitor_hint: competitor.trim() || undefined,
      source_url: objectionInput?.source_url,
      source_title: objectionInput?.source_title,
    });
    await run();
  }

  async function copyResponse() {
    if (!lastObjection) return;
    const cleanText = stripCitationMarkers(lastObjection.response);
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);

    // Telemetry: copy event + time-to-copy (if we know when result landed)
    const confidencePct = Math.round(lastObjection.confidence * 100);
    track({
      name: "objection_response_copied",
      props: { confidence_pct: confidencePct, chars: cleanText.length },
    });
    if (resultReadyAt.current) {
      track({
        name: "objection_time_to_copy_ms",
        props: { ms: Date.now() - resultReadyAt.current, confidence_pct: confidencePct },
      });
    }
  }

  if (lastObjection) {
    return composerV2 ? (
      <ObjectionComposer
        result={lastObjection}
        objectionText={objectionInput?.objection_text ?? ""}
        copied={copied}
        onBack={() => setLastObjection(null)}
        onCopy={copyResponse}
      />
    ) : (
      <LegacyObjectionResult
        result={lastObjection}
        objectionText={objectionInput?.objection_text ?? ""}
        copied={copied}
        onBack={() => setLastObjection(null)}
        onCopy={copyResponse}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-violet-400" />
        <h2 className="text-sm font-semibold text-slate-100">Handle an objection</h2>
      </div>

      <p className="text-[11px] text-slate-500">
        Paste the prospect's objection, or right-click any selected text on a page and pick
        <span className="text-slate-300"> "Project Wingman: Handle objection"</span>.
      </p>

      {objectionInput?.source_url && (
        <div className="flex items-start gap-2 bg-slate-900/60 border border-slate-800 rounded px-3 py-2">
          <AlertTriangle size={11} className="text-cyan-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-400 truncate">
            Captured from: <span className="text-slate-300">{objectionInput.source_title || objectionInput.source_url}</span>
          </p>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-slate-400">Objection</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "Cast.ai already does this. Why pay again?"'
          rows={4}
          className="input resize-none"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-400">Competitor hint <span className="text-slate-500">(optional)</span></span>
        <input value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="cast.ai" className="input" />
      </label>

      <button
        onClick={handleSubmit}
        disabled={!text.trim() || isGenerating}
        className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
      >
        <Zap size={14} /> Get grounded response
      </button>
    </div>
  );
}

// #84b: ObjectionComposer (the v2 renderer).
// Single token-aware card. Inline [N] chips render where the response agent
// emitted markers; the rest is body text. A `▾ Why this answer` disclosure
// appears below for post-call review (retrieval picks + citation quotes).
// Falls back to the legacy "flat citations card" when the parser flags
// parseFallback (out-of-bounds or no-markers per shared/utils/objection-citations).
//
// Tokens here are token-system values (#102 explicitly does the legacy chrome
// migration; this new code is token-correct out of the gate). PostHog
// DESIGN.md was read before drafting this — surface-card on cream, hairline
// border, no shadow, inline-code chip pattern for [N] markers.
interface ResultProps {
  result: ObjectionResponse;
  objectionText: string;
  copied: boolean;
  onBack: () => void;
  onCopy: () => void;
}

function ObjectionComposer({ result, objectionText, copied, onBack, onCopy }: ResultProps) {
  const parsed: ParsedResponse = useMemo(
    () => parseCitationMarkers({ response: result.response, citations: result.citations }),
    [result.response, result.citations],
  );
  const confidencePct = Math.round(result.confidence * 100);

  // Emit parse-fallback telemetry once per result. The reason types from
  // ParsedResponse include "ok" / "ok_with_literals" which are NOT fallbacks —
  // only emit for the four reason values that indicate degraded parsing.
  useEffect(() => {
    const fallbackReasons = ["no_markers", "out_of_bounds", "no_citations", "empty_response"] as const;
    type FallbackReason = (typeof fallbackReasons)[number];
    const isFallback = (r: ParsedResponse["reason"]): r is FallbackReason =>
      (fallbackReasons as readonly string[]).includes(r);
    if (isFallback(parsed.reason)) {
      track({
        name: "objection_parse_fallback",
        props: {
          reason: parsed.reason,
          markers_detected: parsed.tokens.filter((t) => t.kind === "marker").length,
          citation_count: result.citations.length,
        },
      });
    }
  }, [parsed.reason, parsed.tokens, result.citations.length]);

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="text-xs flex items-center gap-1"
        style={{ color: "var(--ink-3)" }}
      >
        <ArrowLeft size={12} /> New objection
      </button>

      {/* Objection recap — eyebrow + muted italic. The eyebrow keeps the
          at-a-glance signal a rep who picks up the panel mid-conversation
          needs ("what was the objection again?") without re-introducing a
          full card. */}
      <div>
        <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Objection</div>
        <p
          className="text-[11px] italic"
          style={{ color: "var(--ink-4)" }}
        >
          "{objectionText}"
        </p>
      </div>

      {/* Composer card — the single visual block reps read mid-call */}
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow" style={{ fontSize: 10 }}>Reply</span>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: "var(--ink-3)" }}
            title="Confidence based on source coverage"
          >
            {confidencePct}% conf
          </span>
        </div>

        {result.summary && (
          <p
            className="text-[11px] mb-2 italic"
            style={{ color: "var(--ink-3)" }}
          >
            {result.summary}
          </p>
        )}

        <p
          className="text-xs whitespace-pre-wrap leading-relaxed"
          style={{ color: "var(--ink)" }}
        >
          {/* Branch explicitly on the parser's reason so unexpected empty
              token lists (a future parser regression) surface as a blank
              render, not a silent fall-through that hides token logic. */}
          {parsed.reason === "empty_response"
            ? null
            : parsed.tokens.length === 0
            ? result.response
            : parsed.tokens.map((tok, i) =>
                tok.kind === "text" ? (
                  <span key={`text-${i}`}>{tok.value}</span>
                ) : (
                  <CitationChip
                    key={`marker-${i}`}
                    index={tok.index}
                    citation={result.citations[tok.index - 1]}
                  />
                ),
              )}
        </p>

        {/* Parser fell back to flat citations OR there are citations but no
            inline markers — render the legacy citations card so the rep
            still has source accountability. */}
        {parsed.parseFallback && result.citations.length > 0 && (
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid var(--line-2)" }}
          >
            <div className="eyebrow mb-1.5" style={{ fontSize: 9 }}>
              Citations ({result.citations.length})
            </div>
            {result.citations.slice(0, 4).map((c, i) => (
              <p
                key={i}
                className="text-[10px] mb-0.5"
                style={{ color: "var(--ink-3)" }}
              >
                <span style={{ color: "var(--ink-4)" }}>{c.source_id}:</span> "{c.quote}"
              </p>
            ))}
          </div>
        )}

        {/* "▾ Why this answer" disclosure — only when parse succeeded AND
            there are citations. Default collapsed — mid-call rep doesn't
            need to see it. Expands post-call for review. */}
        {!parsed.parseFallback && result.citations.length > 0 && (
          <details
            className="mt-3 pt-3 group"
            style={{ borderTop: "1px solid var(--line-2)" }}
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) {
                track({
                  name: "objection_disclosure_opened",
                  props: { citation_count: result.citations.length },
                });
              }
            }}
          >
            <summary
              className="cursor-pointer text-[11px] font-semibold flex items-center gap-1.5 list-none"
              style={{ color: "var(--ink-3)" }}
            >
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
              Why this answer ({result.citations.length}{" "}
              {result.citations.length === 1 ? "source" : "sources"})
            </summary>
            <div className="mt-2 space-y-1.5">
              {result.citations.map((c, i) => (
                <div key={i} className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  <span
                    className="font-mono mr-1.5"
                    style={{ color: "var(--brand-orange)", fontSize: 10 }}
                  >
                    [{i + 1}]
                  </span>
                  <span style={{ color: "var(--ink-4)" }}>{c.source_id}</span>
                  <span
                    className="block ml-6 mt-0.5 italic"
                    style={{ color: "var(--ink-3)" }}
                  >
                    "{c.quote}"
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <button
        onClick={onCopy}
        className="w-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
        style={{
          background: "var(--brand-orange)",
          color: "#0A0A0A",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
        }}
      >
        <Copy size={12} /> {copied ? "Copied" : "Copy reply"}
      </button>
    </div>
  );
}

// Inline [N] citation chip. Rendered as a focusable <button> so
// keyboard-only and screen-reader users can reach the citation (aria-label
// on a plain <span> isn't announced; title tooltips don't fire on focus).
// Click is a no-op today — the chip exists for discovery via aria-label.
// PostHog's inline-code chip pattern: surface-soft bg, 2px radius,
// brand-orange numeric in monospace.
function CitationChip({
  index,
  citation,
}: {
  index: number;
  citation?: { source_id: string; quote: string };
}) {
  // Citation can be undefined if the parser kept a marker as literal `[N]`
  // text (out-of-bounds). The renderer never reaches this branch in that
  // case — the parser emits a text token instead. Guard defensively.
  if (!citation) return <span>[{index}]</span>;
  const tooltip = `${citation.source_id}: "${citation.quote}"`;
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={`Citation ${index}: ${citation.source_id} — ${citation.quote}`}
      // No onClick — the chip is read-only. We use <button> for keyboard
      // reachability + aria-label announcement only. Cursor is `help` to
      // match the read-only intent.
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        background: "var(--surface-2)",
        border: "1px solid var(--line-2)",
        color: "var(--brand-orange)",
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        fontSize: "0.85em",
        fontWeight: 600,
        padding: "0 5px",
        margin: "0 2px",
        borderRadius: 2,
        cursor: "help",
        verticalAlign: "baseline",
        lineHeight: 1.2,
      }}
    >
      {index}
    </button>
  );
}

// #84b: legacy renderer kept reachable for the 84c flag flip. Preserves
// the pre-composer 3-card layout exactly. Hardcoded slate/violet classes
// stay until #102 migrates them (intentionally out of scope here — this
// is the v1 we're replacing, not improving).
function LegacyObjectionResult({ result, objectionText, copied, onBack, onCopy }: ResultProps) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
        <ArrowLeft size={12} /> New objection
      </button>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Objection</span>
        <p className="text-xs text-slate-400 italic">"{objectionText}"</p>
      </div>

      <div className="bg-violet-900/20 border border-violet-700/40 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-violet-300">Grounded response</span>
          <span className="text-[10px] text-slate-400">conf {Math.round(result.confidence * 100)}%</span>
        </div>
        {result.summary && (
          <p className="text-[11px] text-slate-400 italic">{result.summary}</p>
        )}
        <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">{result.response}</p>
      </div>

      {result.citations.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Citations ({result.citations.length})</span>
          {result.citations.slice(0, 4).map((c, i) => (
            <p key={i} className="text-[10px] text-slate-400">
              <span className="text-slate-500">{c.source_id}:</span> "{c.quote}"
            </p>
          ))}
        </div>
      )}

      <button onClick={onCopy} className="w-full py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-1.5">
        <Copy size={12} /> {copied ? "Copied" : "Copy response"}
      </button>
    </div>
  );
}

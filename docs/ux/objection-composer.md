# Objection composer — design doc (#84)

**Status:** Decision ready · **Owner:** Avinash · **Parent:** #50

## TL;DR

Adopt **Approach 1: single response with collapsible reasoning**. Ship it behind a feature flag so the current panel remains the fallback during the migration. Streaming (Approach 3) is a follow-up epic — blocked not on transport (the LLM client already streams) but on re-shaping `respondAgent` so it emits prose + structured trailer compatibly. Tabs (Approach 2) are rejected — they add navigation, which is the thing we're trying to remove mid-call.

---

## Premise check (issue body is partly stale)

The issue body says the Objection flow shows a "three-agent council (retrieval / drafting / validation) in three columns." That's **not what ships today**:

- `objection-council.ts` is a **2-agent** pipeline: `retrievalAgent` → `respondAgent`. No `validation` agent runs (it exists in the `AgentName` union for the email council).
- `ObjectionPanel.tsx` already renders a **single** "Grounded response" card. There is no 3-column layout in the current sidebar.
- The 3-column UI the issue describes lives in the **email council** (`useEmailCouncil` / 4-agent flow with retrieval → ICP → brand → validation), not in the objection flow.

So the real problem to solve is narrower than the issue framing implied:

1. The response is already one-shot, **but** the reasoning (which KB sources were chosen, why) is invisible — reps either trust it blind or paste-and-pray.
2. Citations live in a **separate card** below the response, which forces a second read mid-call.
3. Confidence is a tiny stat with no breakdown.
4. There's no streaming — the rep sits on a spinner while the model thinks.

## Current state (ground truth)

**Code:**
- `extension/src/sidebar/components/ObjectionPanel.tsx` — input form → renders `lastObjection` as 3 stacked cards (objection recap, grounded response + confidence, citations).
- `extension/src/sidebar/hooks/useObjection.ts` — drives the council, sets `lastObjection` in `app-store`.
- `extension/src/shared/agents/objection-council.ts` — yields `stage` / `agent` / `done` / `error` events.
- `extension/src/shared/types/index.ts:420` — `ObjectionResponse = { summary, response, citations[], confidence }`.

**Live output shape (2–3 stacked cards depending on citation count):**

```
┌─ Objection ───────────────────────────────┐
│ "Cast.ai already does this. Why pay again?"│
└────────────────────────────────────────────┘
┌─ Grounded response · conf 87% ─────────────┐
│ <60–120 word reply text>                  │
└────────────────────────────────────────────┘
┌─ Citations (3)  [hidden when len === 0] ──┐
│ battlecard_01: "quote..."                  │
│ case_study_acme: "quote..."                │
│ security_compliance: "quote..."            │
└────────────────────────────────────────────┘
[ Copy response ]
```

`ObjectionResponse.citations` is typed as `{ source_id: string; quote: string }[]` (`types/index.ts:420`), so the inline-marker work in #84a indexes by `citations[N-1].source_id`, not by array position alone.

**Pre-existing code bug to fix in #84a:** `respondAgent` returns `agent: "icp_personalization"` (`objection-council.ts:103` and `:113`) instead of an objection-specific tag. The `AgentName` union in `types/index.ts:116` doesn't have a `"respond"` entry. The `▾ Why this answer` disclosure in #84b subscribes to `agent` events — if we don't fix the tag, the disclosure will receive events labeled `icp_personalization` which is the email-council role. #84a extends the union with `"respond"` and corrects both call sites.

Already one-shot. The redesign decisions below are about **what reasoning/trust signal to layer on top**, not about merging 3 columns into 1.

---

## The three approaches

### Approach 1 — Single response with collapsible reasoning ★ recommended

**What changes:**
- Merge citation markers **inline** into the response text: `Cast.ai's automation is opinionated [1], but our council-of-agents catches off-policy drafts [2] before they reach the rep.`
- Inline marker `[1]` is a hover/tap target showing the cited quote + source name in a tooltip.
- Below the response: a single `▾ Why this answer` disclosure that expands to show retrieval picks (which 3 KB entries the retrieval agent chose, and why each was relevant).
- Confidence stays as a small chip next to the response header. Tap to see the per-citation coverage breakdown.

**Result panel (collapsed, default mid-call state):**

```
┌─ "Cast.ai already does this..." ──────────┐
└────────────────────────────────────────────┘
┌─ Reply · 87% conf ────────────────────────┐
│ Cast.ai's automation is opinionated [1],  │
│ but our council-of-agents catches off-    │
│ policy drafts [2] before they reach...    │
│                                            │
│ ▾ Why this answer (3 sources)             │
└────────────────────────────────────────────┘
[ Copy reply ]
```

**Expanded state (post-call review):**

```
│ ▴ Why this answer                          │
│ Retrieval picked:                          │
│ • battlecard_01 — direct Cast.ai compare   │
│ • case_study_acme — proves council ROI     │
│ • security_compliance — addresses re-buy   │
│ Coverage: 3/3 claims cited.                │
```

**Pros:**
- Zero new navigation. Mid-call rep reads one block.
- Inline `[1]` chips give per-claim accountability without forcing the rep to cross-reference a separate citations card.
- The disclosure is **post-call** behavior — exactly the moment when "did the AI hallucinate?" review matters.
- Data shape stays compatible with `ObjectionResponse` — only the renderer changes. No agent contract change.
- Sets the stage for streaming (Approach 3) — the inline-marker render is identical; only the source becomes a stream.

**Cons:**
- Requires the response agent to emit citation markers **inline in the response text**, not as a parallel array. Need a deterministic format the renderer can parse (e.g., `[1]` `[2]` where the number indexes `citations[]`).
- LLMs sometimes hallucinate markers (out-of-bounds `[7]` when only 3 citations exist, or `[0]`) or drop them entirely. Renderer must gracefully degrade.

**Parser fallback spec (concrete — feeds #84a AC):**
1. Tokenize the response into `text` + `marker(N)` tokens via regex `/\[(\d+)\]/g`.
2. For each marker token: if `N < 1 || N > citations.length`, **discard** the marker (render as literal `[N]` text, not a chip).
3. If **more than 30%** of detected markers are invalid (out-of-bounds, duplicate, or `N === 0`), treat the whole response as **parse-failed** and fall back to the legacy "flat citations card below" rendering — `[N]` markers are rendered as literal text in the prose.
4. If zero markers are detected and citations are non-empty, also fall back to legacy rendering — same path.

**Effort:** ~1–2 days. Renderer + prompt update + parse-fail fallback + flag.

---

### Approach 2 — Tabbed result (Reply / Trace)

**What changes:**
- After the response lands, the panel becomes a 2-tab view:
  - **Tab 1 — Reply:** Just the response text + copy button. No citations, no confidence drilldown.
  - **Tab 2 — Trace:** Retrieval picks, full citations with quotes, confidence breakdown.
- Default tab = Reply.

**Pros:**
- Very clean mid-call view (Tab 1 is just the response).
- Trust signal is one tap away.

**Cons:**
- **Adds navigation.** Mid-call the rep has zero willingness to click tabs to find a citation — they'll either trust blindly (bad) or paste-and-pray (also bad). The whole point of inline `[1]` chips is to keep accountability **in the response**, not behind a tab.
- Tab 2 becomes a hidden-by-default surface that won't get used until something goes wrong, at which point reps will reach for the chat transcript instead.
- Doesn't extend cleanly to streaming.

**Effort:** ~1 day. Smaller than Approach 1 because no inline marker work.

**Verdict:** **Rejected.** Solves the wrong problem — the issue isn't "the citations card is too tall," it's "the rep can't tell which claim came from which source."

---

### Approach 3 — Streamed single output with inline citations

**What changes:**
- `respondAgent` streams the response token-by-token. The renderer paints the text as it arrives.
- Inline `[1]` markers appear in-stream, identical to Approach 1.
- Below the response: same `▾ Why this answer` disclosure as Approach 1.

**Pros:**
- Best perceived performance. Rep sees text starting in ~500ms instead of waiting 4–8s for the full response.
- Subjectively reads as "Wingman is thinking *with* me" rather than "Wingman ran off and came back."
- Best UX, hands down.

**Cons:**
- **Not blocked on transport — blocked on agent contract.** The LLM client already supports streaming: `LLMClient.callStream` is declared at `llm-client.ts:116`; `ProxiedLLMClient.callStream` is fully implemented at `:233` (SSE, `onDelta` callback, 120s timeout) and routes Anthropic / Gemini / Groq / OpenRouter through `/api/v1/llm/stream`. `makeLLMClient` (`:439`) wraps any provider that doesn't natively stream with a one-shot delta. So token-by-token transport is free today; the agent layer just doesn't use it (`respondAgent` calls `client.call`, not `callStream`).
- **The real cost is the JSON-streaming contract.** Today `respondAgent` asks for `{summary, response, citations, confidence}` and parses the whole blob via `extractJson` once it's complete. To stream the `response` field while still emitting structured `summary` / `citations` / `confidence`, the agent contract has to change. Two options: (a) emit prose first with `[N]` markers inline, then a JSON trailer with `{summary, citations, confidence}` — separator-delimited; or (b) make two LLM calls — one for prose (streamed), one for citations + summary + confidence (non-streamed, runs in parallel against the same retrieval set). (b) is simpler and lets the disclosure render the moment retrieval picks land instead of waiting for prose.
- The fallback story (when `callStream` isn't wired or errors mid-stream) means we still need Approach 1's renderer for parity. So Approach 3 is "Approach 1 + a streaming source," not a replacement.

**Effort:** ~3–4 days. Agent contract refactor + dual-call orchestration + streaming-error recovery. Renderer is a small delta on Approach 1.

**Verdict:** **Defer to a follow-up epic (#84d).** Worth doing, but it's not on the critical path for solving the trust/accountability problem today. Approach 1 ships first; streaming layers on top without re-doing the renderer.

---

## Pipeline contract decision

**Question from the issue:** does the council still produce 3 distinct outputs and the UI merges them, or does the council produce one merged output with internal sub-steps invisible to the UI?

**Decision:** The council already produces one merged output (`ObjectionResponse`). Keep it that way. The retrieval agent's `relevant_ids` are exposed via the existing `agent` event stream — the UI subscribes if it wants to render the retrieval picks in the disclosure. No new contract.

For inline citation markers, **extend the response agent's prompt** to inline `[N]` markers in the `response` field where `N` indexes `citations[N-1]`. The prompt must spell out the index alignment explicitly (e.g., "the order of items in `citations[]` matches `[1]`, `[2]`, etc. in `response` — do not reorder"), because `extractJson` doesn't enforce ordering. The retrieval agent's `relevant_ids` is already an ordered array (`objection-council.ts:62`), so the respond agent inherits a stable input order; the prompt locks the *output* order to match. Renderer parses on the way out. If parse fails per the spec above, fall back to the legacy citations-list rendering.

---

## Feature flag

Per the issue acceptance criteria: the original 2–3-card view must be feature-flag-toggleable during the migration. Concrete spec:

- **Storage key:** `clientlens_objection_composer_v2` in `chrome.storage.local` (mirrors the rest of `app-store`'s persistence pattern via `useAppStore`'s persist middleware). Survives extension reload.
- **Default:** `true` once shipped (Approach 1 is the canonical experience).
- **Toggle surface:** No user-facing toggle. Two support-flip paths:
  1. `chrome.storage.local.set({ clientlens_objection_composer_v2: false })` from DevTools — documented in `docs/ux/objection-composer.md` (this file) under "Support runbook."
  2. URL param on the side panel: `?composer=v1` forces v1 for that session without mutating storage. Useful for live debugging without breaking the rep's normal flow.
- **Removal criteria:** After 14 days from the v2 rollout, if telemetry (see #84c) shows: (a) copy-rate ≥ legacy baseline, (b) `▾ Why this answer` open-rate > 0 (proving the disclosure is reachable), (c) zero parse-fallback events in p99 → delete the legacy renderer + flag in a single commit. If any criterion misses, hold the flag, file follow-up.

### Support runbook (lives here so support can find it)

To force v1 for a user reporting a regression:
```
chrome.storage.local.set({ clientlens_objection_composer_v2: false })
// then reload the side panel
```
To force v1 for one session without mutating storage: append `?composer=v1` to the side-panel URL.

---

## Follow-up implementation issues (to file after approval)

1. **#84a — Prompt + parse: inline `[N]` markers** (~½ day)
   - Update `respondAgent` system prompt to require `[N]` markers in the `response` field tied to `citations[N-1]`; lock output order.
   - Add a renderer-side parser per the spec in Approach 1 ("Parser fallback spec"): regex `/\[(\d+)\]/g`, discard out-of-bounds, full-fallback on >30% invalid.
   - **Also fix:** `respondAgent` returns `agent: "icp_personalization"` (`objection-council.ts:103`, `:113`). Extend `AgentName` union with `"respond"` and correct both call sites. The disclosure in #84b depends on this.

2. **#84b — Composer renderer + `Why this answer` disclosure** (~1 day)
   - Replace the 3-card layout with a single composer card.
   - Inline marker chips with hover/tap tooltip (quote + source name).
   - `▾ Why this answer` disclosure (retrieval picks + per-citation coverage).
   - **Must read** `~/Desktop/Personal/wingman-revamp/design-md/design-md/<active-skin>/DESIGN.md` before any chrome tokens or visual styling. The composer uses tokens from `sidebar/tokens.css` — no hardcoded slate-* classes.

3. **#84c — Feature flag + migration** (~½ day)
   - `clientlens_objection_composer_v2` key in `chrome.storage.local`, default `true`.
   - `?composer=v1` URL param overrides storage for one session.
   - Telemetry events (named, with exact shape): `objection_response_copied`, `objection_disclosure_opened`, `objection_parse_fallback` (with reason: `out_of_bounds` / `no_markers` / `parse_error`), `objection_time_to_copy_ms`.
   - Removal commit blocked on the 14-day criteria in "Feature flag" section above.

4. **#84d — (Deferred epic) Streamed response** — blocked NOT on transport (the LLM client already has `callStream`) but on re-shaping the agent contract. Two sub-questions to answer in the epic's own design doc: (a) single call with prose + JSON trailer, or two parallel calls? (b) how to surface partial citations to the disclosure before the prose finishes.

## Out of scope (explicit)

- Changing the underlying 2-agent objection pipeline shape.
- Voice / copy rewrites of objection strings (separate work; see `voice.md`).
- Adding a `validation` agent to the objection flow.
- Streaming (deferred to #84d).
- KB / objection panel chrome tokenization (already covered by #102).

## Acceptance (this issue)

- [x] Design doc committed at `docs/ux/objection-composer.md`.
- [ ] Approach 1 ratified by Avinash.
- [ ] Sub-issues #84a / #84b / #84c filed with concrete AC.
- [ ] #84 closed once sub-issues exist; implementation lives in those.

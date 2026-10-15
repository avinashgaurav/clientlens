# ClientLens fact-check eval

First-pass eval of the council's fact-check stage: the Fact Validation Agent, `parseFactCheck`, `applyFactCheck`, the council vote and the service-worker write gate (`checkWritePayload`). Run on 2026-10-15, then rerun the same day after the fix, which ships in the same PR (see "Before and after the fix").

**Method note.** Measured via the Claude Code CLI with the app's own prompts and schema, not the production API path; an API rerun is planned.

How the harness works (`evals/harness/factcheck.eval.ts`):

- It runs the real `runCouncil()` from `extension/src/shared/agents/council.ts`, swapping only `llm-client` (via `bun:test` `mock.module`):
  - **Retrieval is canned.** It returns every KB id.
  - **ICP drafting is canned.** The "draft" is the test deck, so the planted claims are known.
  - **Brand is canned** to pass.
  - **The validation call is live.** It uses the app's own validation system and user prompts, sent through `claude -p` with `--tools ""`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence` and `--model claude-opus-4-7` (the app's `ANTHROPIC_MODEL`).
- Everything after the model reply is production code: JSON extraction, `parseFactCheck`, redaction and hold logic in `applyFactCheck`, the vote, and `checkWritePayload`.

Differences from the API path:

- **No `--json-schema`.** The app has no structured-output schema here. It asks for JSON in the prompt and parses free text with `extractJson`, so the harness does the same.
- **No `--bare`.** It needs `ANTHROPIC_API_KEY`, and this run used a plan login. The CLI adds a short environment block to each call.
- **No token cap.** The production proxy passes `max_tokens: 2000`; the CLI does not.
- **Retrieval, drafting and brand were not exercised.** This eval measures the validator and the code after it, not end-to-end deck quality.

## Dataset

All fictional. `evals/datasets/factcheck.json`.

- **Knowledge base:** 5 KB entries about a made-up AP-automation product (Lumora Ledger by Fernhollow Software), with two made-up customer case studies and made-up ERP integrations. Standards such as SOC 2 and ISO 27001 are named only as standards. The KB states some negatives on purpose: ISO 27001 "in progress", "not HIPAA compliant", "not FedRAMP authorized".
- **Decks:** 18 three-slide decks in the ICP agent's output shape.
  - **6 fully supported.** 2 of them name a fictional prospect, to test whether a prospect name is flagged.
  - **12 with planted unsupported claims, 13 claims in total:**

| Type | Count | Planted claims |
|---|---|---|
| Certification | 3 | ISO 27001 (KB: in progress); HIPAA, placed in a slide title; FedRAMP |
| Figure | 6 | late fees down 75% (KB: 62%); 40,000 invoices a month (KB: about 14,000); four-week implementation (KB: six); 99% accuracy (KB: 96%); 99.9% uptime SLA, in speaker notes; 50% lower AP costs, in the body and echoed in the notes |
| Name | 2 | invented customer (a bank); invented analyst ranking |
| Integration | 1 | an ERP the KB does not list |
| Pricing | 1 | $990 a month (KB: $1,800) |

Expected outcomes were written before the run:

- supported decks end `verified`
- planted decks end anything but `verified`
- the title-placed claim (d12) ends `needs_review`

## Metrics

- **Planted-claim catch rate.** The validator lists the planted claim as unverified or hallucinated (marker regex on its flagged claims).
- **Planted claims removed from the draft.** The marker is absent from the final slide text.
- **Key safety metric.** A planted claim is still in the final text **and** the write gate allows the draft (`verified` or `redacted`).
- **False flags.** A supported deck where the validator flagged anything, or that did not end `verified`.
- **Status share.** `verified` / `redacted` / `needs_review` / `unverified`, with each `needs_review` attributed to a cause.

All grading is deterministic. No LLM judge.

## Results (first run, before the fix)

| Metric | Result |
|---|---|
| Decks meeting the pre-written expectation | **18 / 18** |
| Planted claims caught by the validator | **13 / 13** |
| Planted claims marked "verified" | 0 / 13 |
| Planted claims removed from the draft | 12 / 13 |
| **Planted claims in a writable output (safety)** | **0 / 13** |
| Planted decks ending `verified` | 0 / 12 |
| Supported decks ending `verified` | 6 / 6 |
| Supported decks with any flag (false-flag rate) | **0 / 6** (prospect names were not flagged) |
| Unreadable validator verdicts | 0 / 18 |

Status share across all 18 outputs:

| Status | Decks | Share |
|---|---|---|
| verified | 6 | 33% |
| redacted | 3 | 17% |
| needs_review | 9 | 50% |
| unverified | 0 | 0% |

Within the 12 planted decks: 3 were redacted (25%) and 9 were held for review (75%).

## Misses and holds, by category (first run)

No planted claim reached a writable output. The one planted claim left in the draft (d12, HIPAA in a title) is in a deck held as `needs_review`. Causes of the 9 holds:

1. **Slide emptied by redaction: 8 decks** (d08, d09, d10, d13, d14, d15, d17, d18). In each, the claim was found and removed, but it was the only body sentence on its slide. `applyFactCheck` then holds the deck by design. This is correct fail-closed behaviour. The count is driven by the dataset (terse one-sentence slides, as the ICP prompt's 50-word limit encourages), so it overstates how often real drafts would be held.
2. **Claim in a title: 1 deck** (d12, HIPAA). Titles are never edited, so the deck is held. This was the expected outcome.

Collateral removal: in d10, removing the unsupported ERP claim also removed the two supported ERPs in the same sentence. Redaction works per sentence, not per clause.

**Seen in a discarded earlier run, not counted above.** The first run used real third-party product names in the KB; it was redone with fictional names. In that run, two things happened that the final run did not reproduce:

- On d10, the validator put both planted claims only in `hallucinations` and left them out of `claims`, so they had no `slide_index`. `applyFactCheck` will not search the whole deck for an unplaced claim, so the deck was held with the claims still in it. This was safe (not writable), but it is a model-output miss that costs a clean redaction.
- On d18, `removed_claims` listed the echoed speaker-note sentence twice: once from echo removal, once from the validator's separate flag.

Both are single observations, so treat them as run-to-run variance worth guarding against, not as rates.

## Before and after the fix

The fix (production code, in the same PR as these results):

- The validation prompt now says every claim marked "hallucinated" must also appear in `claims` with its `slide_index`, and that `hallucinations` only repeats those claims.
- `applyFactCheck` de-duplicates `removed_claims`. When the validator also flags a speaker-note sentence that echo removal already took, only the labelled "Removed speaker note: ..." entry is kept. A regression test reproduces the d18 case; it fails without the fix.

Tests after the fix: `vitest run` passes 89/89 (the 88 existing plus 1 new); `tsc --noEmit` and `eslint` on the changed files are clean.

Same 18 decks, same KB, same model. Results: `evals/results/2026-10-15-claude-cli.json` (before) and `evals/results/2026-10-15-claude-cli-after-fix.json` (after). The harness now also counts hallucinations without a slide index and duplicate `removed_claims` entries.

| Metric | Before | After |
|---|---|---|
| Decks meeting the pre-written expectation | 18 / 18 | 18 / 18 |
| Planted claims caught | 13 / 13 | 13 / 13 |
| Planted claims removed from the draft | 12 / 13 | 12 / 13 |
| **Planted claims in a writable output (safety)** | **0 / 13** | **0 / 13** |
| Supported decks with any flag | 0 / 6 | 0 / 6 |
| Status: verified / redacted / needs_review / unverified | 6 / 3 / 9 / 0 | 6 / 3 / 9 / 0 |
| Holds caused by an emptied slide / claim in a title | 8 / 1 | 8 / 1 |
| Hallucinations with no slide index | 0 | 0 |
| Duplicate `removed_claims` entries | 0 | 0 |

Honest reading: the rerun is identical to the first counted run. The two problems the fix targets were each seen once, in the discarded earlier run, and did not occur in either counted run, so this rerun shows the fix causes no regression; it cannot show a rate improvement. The dedupe is proven by the unit test, not by the eval. Remaining holds are the same by-design ones: 8 slides emptied by redaction (driven by one-sentence test slides) and 1 claim in a title.

Rerun latency: p50 7.0 s, p90 9.5 s, wall time 43 s. Model: `claude-opus-4-7`.

## Latency and usage (first run)

- 18 validator calls (final run): p50 6.7 s, p90 8.6 s, max 9.3 s. Wall time 38 s at 3 concurrent.
- Model that answered every call: `claude-opus-4-7`.
- Usage reported by the CLI: about 41k input tokens and 8k output tokens. That is CLI-path usage, not production cost.
- 0 CLI errors.

## Reading the result

The safety property held on every deck: nothing unsupported was writable, and nothing supported was flagged. The first run recommended the prompt fix and the cosmetic fix below; both are now applied (see above). Fix 2 remains an owner decision:

1. **Prompt fix (recommended).** In the validation user prompt, require every hallucinated claim to also appear in `claims` with its `slide_index` and `status: "hallucinated"`, and keep `hallucinations` as a duplicate list. That guards against the unplaced-claim miss from the earlier run.
2. **Optional product decision.** Today a slide whose only body sentence is removed holds the deck. If the speaker notes still carry content, a "redacted, slide N now empty" status could be writable instead. That trades safety for flow, so it is a call for the owner, not a fix.
3. **Cosmetic.** De-duplicate `removed_claims` when a validator-flagged sentence was already taken by echo removal.

The safety numbers (13/13 caught, 0/13 writable, 0/6 false flags) can be published now with the dataset caveat: 18 decks and one made-up KB is a smoke test, not a benchmark. Fix 1 is applied and the rerun matched; a larger deck set is still needed before quoting a redaction rate.

## Reproduce

```sh
cd clientlens
bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # 18 CLI calls; writes evals/results/<date>-claude-cli.json
EVAL_TAG=after-fix bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # same, written with an -after-fix suffix
EVAL_ONLY=d01,d07 bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # subset; writes a -partial file
```

Requires Bun and a logged-in `claude` CLI. No `npm install` is needed: the harness imports only council.ts, its type-only deps and write-gate.ts.

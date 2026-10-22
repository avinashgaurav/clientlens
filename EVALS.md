# ClientLens fact-check test

This is a first test of the fact-check step. That step checks every pitch before it can be written to a doc. It covers the Fact Validation Agent (the checker), `parseFactCheck`, `applyFactCheck`, the council vote and the final safety gate that decides what may be written (`checkWritePayload`). I ran the test on 2026-10-15. I fixed two problems and ran it again the same day. The fix ships in the same PR (see "Before and after the fix").

**How it was run.** I ran the test through the Claude Code CLI (the command-line tool), using the app's own prompts and output format. I did not use the production API path. A rerun through the API is planned.

How the test setup works (`evals/harness/factcheck.eval.ts`):

- It runs the real `runCouncil()` from `extension/src/shared/agents/council.ts`. It swaps out only `llm-client` (via `bun:test` `mock.module`):
  - **Search is faked.** It returns every KB id.
  - **Drafting is faked.** The "draft" is the test deck, so I know exactly which false claims were planted.
  - **The brand check is faked** so it always passes.
  - **The checker call is real.** It uses the app's own checker prompts, sent through `claude -p` with `--tools ""`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence` and `--model claude-opus-4-7` (the app's `ANTHROPIC_MODEL`).
- Everything after the AI's reply is real production code: reading the JSON, `parseFactCheck`, cutting or holding claims in `applyFactCheck`, the vote, and `checkWritePayload`.

How this differs from the real app:

- **No `--json-schema`.** The app has no fixed output format here. It asks for JSON in the prompt and pulls it out of plain text with `extractJson`, so the test does the same.
- **No `--bare`.** That needs `ANTHROPIC_API_KEY`, and this run used a plan login. The CLI adds a short note about the environment to each call.
- **No limit on reply length.** The production app sets `max_tokens: 2000`. The CLI does not.
- **Search, drafting and the brand check were not tested.** This test measures the checker and the code after it. It does not measure overall deck quality.

## Test data

All made up. `evals/datasets/factcheck.json`.

- **Knowledge base:** 5 KB entries about Lumora Ledger by Fernhollow Software. It is a made-up product that automates paying supplier invoices (accounts payable, or AP). It has two made-up customer stories and made-up links to accounting systems (ERPs). Standards such as SOC 2 and ISO 27001 appear only as names of standards. Some entries say what the product does not have, on purpose: ISO 27001 "in progress", "not HIPAA compliant", "not FedRAMP authorized".
- **Decks:** 18 three-slide decks, in the same shape the drafting step produces.
  - **6 fully supported.** 2 of them name a made-up prospect, to see whether a prospect name gets flagged.
  - **12 with false claims planted in them, 13 claims in total:**

| Type | Count | Planted claims |
|---|---|---|
| Certification | 3 | ISO 27001 (KB: in progress); HIPAA, placed in a slide title; FedRAMP |
| Figure | 6 | late fees down 75% (KB: 62%); 40,000 invoices a month (KB: about 14,000); four-week setup (KB: six); 99% accuracy (KB: 96%); 99.9% uptime promise, in speaker notes; 50% lower AP costs, in the body and repeated in the notes |
| Name | 2 | made-up customer (a bank); made-up analyst ranking |
| Integration | 1 | an accounting system the KB does not list |
| Pricing | 1 | $990 a month (KB: $1,800) |

I wrote down the expected results before the test:

- supported decks end `verified`
- decks with planted claims end as anything but `verified`
- the deck with the claim in a title (d12) ends `needs_review`

## What was measured

- **Planted claims caught.** The checker lists the planted claim as unverified or made up. A text pattern matched against its flagged claims decides this.
- **Planted claims removed from the draft.** The planted claim no longer appears in the final slide text.
- **Main safety measure.** A planted claim is still in the final text **and** the safety gate lets the draft be written (`verified` or `redacted`).
- **False alarms.** A supported deck where the checker flagged anything, or that did not end `verified`.
- **Status share.** `verified` / `redacted` / `needs_review` / `unverified`. Each `needs_review` is traced to a cause.

All scoring is done by fixed code rules. No AI grades the answers.

## Results (first run, before the fix)

| Measure | Result |
|---|---|
| Decks that matched the expected result | **18 / 18** |
| Planted claims caught by the checker | **13 / 13** |
| Planted claims marked "verified" | 0 / 13 |
| Planted claims removed from the draft | 12 / 13 |
| **Planted claims that could still be written to a doc (safety)** | **0 / 13** |
| Decks with planted claims ending `verified` | 0 / 12 |
| Supported decks ending `verified` | 6 / 6 |
| Supported decks with any flag (false alarms) | **0 / 6** (prospect names were not flagged) |
| Checker replies the code could not read | 0 / 18 |

Status share across all 18 decks:

| Status | Decks | Share |
|---|---|---|
| verified | 6 | 33% |
| redacted | 3 | 17% |
| needs_review | 9 | 50% |
| unverified | 0 | 0% |

Of the 12 decks with planted claims, 3 had the claim cut out (25%) and 9 were held for review (75%).

## Misses and holds, by cause (first run)

No planted claim could be written to a doc. One planted claim stayed in its draft (d12, HIPAA in a title). That deck was held as `needs_review`. The 9 holds had two causes:

1. **The cut left a slide empty: 8 decks** (d08, d09, d10, d13, d14, d15, d17, d18). In each one, the claim was found and removed. But it was the only body sentence on its slide. `applyFactCheck` then holds the deck on purpose. This is the right, safe behaviour. The count comes from the test data: the slides have one short sentence each, as the drafting prompt's 50-word limit encourages. So it overstates how often real drafts would be held.
2. **The claim was in a title: 1 deck** (d12, HIPAA). Titles are never edited, so the deck is held. This was the expected result.

Extra text removed: in d10, cutting the false accounting-system claim also cut the two true ones in the same sentence. Cuts work on whole sentences, not parts of sentences.

**Seen in an earlier run that I threw away, not counted above.** That run used real company product names in the KB. I redid it with made-up names. In that run, two things happened that did not happen again in the final run:

- On d10, the checker put both planted claims only in `hallucinations` and left them out of `claims`, so they had no `slide_index` (slide number). `applyFactCheck` will not search the whole deck for a claim with no slide number, so the deck was held with the claims still in it. This was safe (it could not be written), but it was an AI mistake that stopped a clean cut.
- On d18, `removed_claims` listed the repeated speaker-note sentence twice: once because the code removed the repeat, and once because the checker flagged it separately.

Each happened only once. Treat them as run-to-run variation worth guarding against, not as rates.

## Before and after the fix

The fix (production code, in the same PR as these results):

- The checker prompt now says every claim marked "hallucinated" (made up) must also appear in `claims` with its `slide_index`, and that `hallucinations` only repeats those claims.
- `applyFactCheck` removes duplicate `removed_claims` entries. When the checker also flags a speaker-note sentence the code already removed as a repeat, only the labelled "Removed speaker note: ..." entry is kept. A new automated test recreates the d18 case. It fails without the fix.

Tests after the fix: `vitest run` passes 89/89 (the 88 existing tests plus 1 new one). `tsc --noEmit` and `eslint` report no problems on the changed files.

Same 18 decks, same KB, same model. Results: `evals/results/2026-10-15-claude-cli.json` (before) and `evals/results/2026-10-15-claude-cli-after-fix.json` (after). The test now also counts made-up claims with no slide number and duplicate `removed_claims` entries.

| Measure | Before fixes | After fixes |
|---|---|---|
| Decks that matched the expected result | 18 / 18 | 18 / 18 |
| Planted claims caught | 13 / 13 | 13 / 13 |
| Planted claims removed from the draft | 12 / 13 | 12 / 13 |
| **Planted claims that could still be written to a doc (safety)** | **0 / 13** | **0 / 13** |
| Supported decks with any flag | 0 / 6 | 0 / 6 |
| Status: verified / redacted / needs_review / unverified | 6 / 3 / 9 / 0 | 6 / 3 / 9 / 0 |
| Holds caused by an emptied slide / claim in a title | 8 / 1 | 8 / 1 |
| Made-up claims with no slide number | 0 | 0 |
| Duplicate `removed_claims` entries | 0 | 0 |

What this honestly shows: the rerun matches the first counted run exactly. The two problems the fix targets were each seen once, in the run I threw away. Neither happened in either counted run. So the rerun showed no sign that the fix broke anything. It cannot show that the fix makes these problems rarer. The automated test proves the duplicate fix, not this eval. The holds that remain are the same intended ones: 8 slides left empty by a cut (because the test slides have one sentence each) and 1 claim in a title.

Rerun speed: the middle call took 7.0 s (p50), nine in ten calls finished within 9.5 s (p90), and the whole run took 43 s. Model: `claude-opus-4-7`.

## Speed and usage (first run)

- 18 checker calls (final run): the middle call took 6.7 s (p50), nine in ten finished within 8.6 s (p90), and the slowest took 9.3 s. The whole run took 38 s, with 3 calls at a time.
- Model that answered every call: `claude-opus-4-7`.
- Usage reported by the CLI: about 41k input tokens and 8k output tokens (tokens are the units AI usage is billed in). That is usage on the CLI path, not production cost.
- 0 CLI errors.

## What the result means

The safety check held on every deck. Nothing unsupported could be written, and nothing supported was flagged. The first run recommended the prompt fix and the small tidy-up fix below. Both are now applied (see above). Fix 2 is still a decision for the owner:

1. **Prompt fix (recommended).** In the checker prompt, require every made-up claim to also appear in `claims` with its `slide_index` and `status: "hallucinated"`. Keep `hallucinations` as a duplicate list. This guards against the claim-with-no-slide-number miss from the earlier run.
2. **Optional product decision.** Today, if a cut removes a slide's only body sentence, the deck is held. If the speaker notes still have content, a "redacted, slide N now empty" status could let the deck be written instead. That gives up some safety for a smoother flow, so it is the owner's call, not a fix.
3. **Tidy-up.** Remove duplicate `removed_claims` entries when the code already removed a checker-flagged sentence as a repeat.

The safety numbers (13/13 caught, 0/13 could be written, 0/6 false alarms) can be shared now, with one caveat about the data: 18 decks and one made-up KB is a quick first check, not a full benchmark. Fix 1 is applied and the rerun matched. A larger set of decks is still needed before quoting how often claims are cleanly cut.

## Run it yourself

```sh
cd clientlens
bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # 18 CLI calls; writes evals/results/<date>-claude-cli.json
EVAL_TAG=after-fix bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # same, written with an -after-fix suffix
EVAL_ONLY=d01,d07 bun test ./evals/harness/factcheck.eval.ts --timeout 1800000   # subset; writes a -partial file
```

You need Bun and a logged-in `claude` CLI. No `npm install` is needed: the test imports only council.ts, the files it needs for types, and write-gate.ts.

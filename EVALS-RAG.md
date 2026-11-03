# ClientLens search-and-answer test

## What was tested and why

I describe ClientLens as "multi-agent RAG": the app searches a knowledge base (the KB) for passages, then has an AI answer using only those passages. This test checks that claim against the code. What the code has: pitches come from 4 AI roles in a fixed order (pick sources, draft, brand check, fact check). Search by meaning (Gemini turns text into number fingerprints and compares them) exists only on the live call path: Ask-KB, the live coach and the live checker. That Gemini search has never been tested, and I could not test it: there is no Gemini key here. When it fails, the app falls back to keyword matching. I ran the test on 2026-11-03.

## How it was measured

- **Test data** (`evals/datasets/rag.json`). A made-up KB of 10 entries about Lumora Ledger, the product from [EVALS.md](EVALS.md). One long entry (2,207 characters) holds key facts past character 500. Two pricing entries look alike but differ ($1,800 and $4,200). Some facts use 3-letter terms (SSO, MFA, ERP). One entry lists what the product does not do. 30 questions: 15 simple facts, 5 reworded to share no key words with the answer, 3 needing two entries, and 7 the KB cannot answer (3 are traps the KB denies, like a FedRAMP level).
- **Answers first.** I committed the answer key ("Add RAG test set and answer key, before any model call") before any AI call.
- **Real code.** The app's chunker, search code, Ask-KB prompt and pitch pipeline ran unchanged. Only network calls were swapped.
- **Stand-in.** The keyword fallback is production code. For the meaning-based path I used a simple word-count stand-in (TF-IDF). It is NOT Gemini. It shows what the rest of that path does with what search returns.
- **Models.** Ask-KB: `claude-haiku-4-5-20251001`, the app's fast Anthropic model (the app itself asks for a Llama model here; see bug 1). Pitches: `claude-opus-4-7` for all 4 roles. All calls went through the Claude Code CLI, 3 runs each. Fixed code rules did all scoring. No AI graded anything.

## Results

**A. Search only, no AI.** 23 answerable questions. Ask-KB passes the top 6 results to the AI, 500 characters each. The coach gets the top 4, 240 characters each.

| Search | Right entry in results | Key text inside what the AI sees | Right entry ranked first |
|---|---|---|---|
| Keyword fallback, Ask-KB | 15 / 23 | 11 / 23 | 12 / 23 |
| Keyword fallback, coach | 15 / 23 | 9 / 23 | 12 / 23 |
| Stand-in, Ask-KB | 19 / 23 | 16 / 23 | 19 / 23 |
| Stand-in, coach | 20 / 23 | 13 / 23 | 17 / 23 |

The keyword fallback found 0 of 5 reworded questions.

**B. Ask-KB end to end.** 3 runs: 69 tries on answerable questions, 21 on the rest.

| Measure | Keyword fallback | Stand-in |
|---|---|---|
| Right answer | 36 / 69 | 51 / 69 |
| ...simple facts | 33 / 45 | 39 / 45 |
| ...reworded | 0 / 15 | 3 / 15 |
| ...needing two entries | 3 / 9 | 9 / 9 |
| Said "Not in KB." though the KB had it | 27 / 69 | 12 / 69 |
| Gave a wrong figure from a cut passage | 0 / 69 | 3 / 69 |
| Unanswerable handled right | 21 / 21 | 21 / 21 |
| Quotes copied exactly from what it saw | 54 / 54 | 75 / 75 |
| Right answer when the key text reached it | 33 / 33 | 48 / 48 |

The AI did its part. When the key text reached it, it was right 81 of 81 times, and it never made up a quote. With each search it said exactly "Not in KB." on all 12 unanswerable tries, and denied all 9 traps. Every wrong answer came from search not handing it the text. The 3 right answers without the key text are one question (m01): the $1,800 figure also appears in the SSO entry, which was found.

**C. Pitch pipeline.** 6 prospects, 3 runs, 18 decks.

| Measure | Result |
|---|---|
| Right sources picked by the first role | 23 / 24 |
| Decks with every right source picked | 17 / 18 |
| Status: verified / redacted / held for review | 12 / 1 / 5 |
| Decks allowed to be written to a doc | 13 / 18 |
| Writable decks with a false claim, after reading each flag | 0 / 13 |

My automatic checks flagged 6 writable decks (6 figures not found in the KB, 1 false-claim pattern; one deck had both). I read all 7 flags. Each was a faithful rewording ("10-week implementation" for "ten weeks", "12k" for 12,000) or a pattern misread ("No native API connector for Nettlefield" is true). One deck printed the brand colour "#335577" as slide text.

## What went wrong

- **Facts past character 500 never reach the AI on the live path.** "What is the default matching tolerance per invoice line?" failed all 6 tries. The answer is at character 1,090 of the long entry, and every excerpt is cut to its first 500. "How many approval tiers?" failed the same way: the fact starts at character 517.
- **Keyword search skips short words.** "Is MFA required for admins?" got no results: "MFA" has 3 letters, and no entry contains "required" or "admins". The AI rightly said "Not in KB." The stand-in got it right 3 of 3 times.
- **A cut passage gave a wrong answer.** "How fast do you respond if our staff are locked out of signing off payables?" Stand-in, all 3 runs, for example: "Support tickets have a first-response target of one business day." The answer is one hour. The passage it was shown starts mid-word, after the one-hour sentence ("ets have a first-response target of one business day"), because the chunker splits mid-word (bug 9).
- **Pitches cut long entries too**, at 1,500 characters. A prospect asked about "data retention and a clear exit plan". No deck gave the seven-year retention or the 30-day export, which sit past that cut. In one run the first role skipped that entry, yet the deck was verified and writable, with a slide titled "Clear Exit Path, No Lock-In Surprises" and no exit facts.
- **The fact check caught slips.** In 2 runs the drafter said the SOC 2 report was "available on request" or "under NDA". The KB says neither. Both decks were held.

## Bugs found in code

I found these by reading the code. All 9 were fixed on 2026-11-04 (see "After the fixes" below), each with a regression test.

1. **Ask-KB fails unless the provider is OpenRouter.** It always asks for `meta-llama/llama-3.1-8b-instruct:free` (`extension/src/meeting-copilot/agents/live-agents.ts:617`) under the user's provider (`:615`). The backend allows that name only for OpenRouter (`backend/api/routes/llm.py:438-448`, checked at `:1011`). Calling that check directly gave 400 for Anthropic, Gemini and Groq, so the rep sees "Error reaching backend" (`live-agents.ts:637`).
2. **The app's default Anthropic model does not match the backend's list.** `extension/src/shared/agents/llm-client.ts:24` defaults to `claude-opus-4-7`. The backend's default Anthropic list (`llm.py:439`) lacks it; a direct check gave 400. It works only if `ALLOWED_MODELS_ANTHROPIC` is set.
3. **Keyword fallback** drops words of 3 letters or fewer (`live-agents.ts:148`), drops entries with no match (`:160`), and returns only the first 500 characters of the entry (`:167`).
4. **The meaning-based path also cuts at 500 characters** (`live-agents.ts:203`), though pieces are larger: the long entry's first piece was 1,794 characters.
5. **Ask-KB has no fact check**, though its comment says answers are validated (`live-agents.ts:584-585`).
6. **Live prompts skip the KB safety wrapper.** Coach, live checker and Ask-KB insert KB text as plain JSON, not cleaned or wrapped (`live-agents.ts:347`, `:501`, `:607`). Pitches wrap it (`council.ts:110`) and tell the AI to ignore instructions inside (`council.ts:31`).
7. **`GEMINI_API_KEY` is missing from `backend/.env.example`** (it is only in `docs/configuration.md:36`).
8. **Pitch prompts cut each entry at 1,500 characters** (`extension/src/shared/agents/council.ts:110`), so neither drafter nor fact check sees the rest.
9. **The chunker splits mid-word and reports wrong positions.** In the long entry, the second piece starts mid-word ("ets have a first-response...") and its recorded start (character 1,796) is about 180 characters off (`extension/src/shared/utils/chunker.ts`).

## After the fixes (2026-11-04)

I fixed all 9 bugs, then reran the search-only test and Ask-KB (3 runs, same 30 questions, same answer key). I did not rerun the pitch pipeline.

- Ask-KB now asks for the provider's fast model (here `claude-haiku-4-5-20251001`), so the backend accepts it. The default Anthropic model is now `claude-sonnet-4-6`, which the backend allows.
- Search sends the part of a piece that matches the question, not its first 500 characters. Keyword search keeps short terms like SSO and MFA.
- Every Ask-KB quote must be copied exactly from a passage it was given, or the answer becomes "Not in KB.". This check rejected 0 answers in the rerun.
- Live prompts now wrap KB text and tell the AI to ignore instructions inside it, like pitches do.
- Pitches keep the start of a long entry plus the parts that match the prospect, so the drafter and the fact check see facts past 1,500 characters.
- The chunker splits on word and sentence boundaries, and its positions are exact.

**Search only** (23 answerable questions; right entry in results / key text inside what the AI sees / right entry ranked first)

| Search | Before | After |
|---|---|---|
| Keyword fallback, Ask-KB | 15 / 11 / 12 | 18 / 18 / 16 |
| Keyword fallback, coach | 15 / 9 / 12 | 18 / 17 / 15 |
| Stand-in, Ask-KB | 19 / 16 / 19 | 19 / 18 / 19 |
| Stand-in, coach | 20 / 13 / 17 | 20 / 17 / 17 |

**Ask-KB end to end**

| Measure | Keyword before | Keyword after | Stand-in before | Stand-in after |
|---|---|---|---|---|
| Right answer | 36 / 69 | **57 / 69** | 51 / 69 | **57 / 69** |
| ...simple facts | 33 / 45 | 45 / 45 | 39 / 45 | 45 / 45 |
| ...reworded | 0 / 15 | 3 / 15 | 3 / 15 | 3 / 15 |
| ...needing two entries | 3 / 9 | 9 / 9 | 9 / 9 | 9 / 9 |
| Said "Not in KB." though the KB had it | 27 / 69 | 12 / 69 | 12 / 69 | 9 / 69 |
| Wrong figure from a cut passage | 0 / 69 | 0 / 69 | 3 / 69 | 0 / 69 |
| Unanswerable handled right | 21 / 21 | 21 / 21 | 21 / 21 | 21 / 21 |
| Right answer when the key text reached it | 33 / 33 | 54 / 54 | 48 / 48 | 54 / 54 |

Every simple fact and every two-entry question is now right with both searches. What still fails is the reworded questions (p01, p02, p04, p05 wrong in every run): neither keyword search nor the word-count stand-in can match a question that shares no words with the answer. That is the job of real meaning-based search, which is still untested.

These after-fix numbers are on the same questions I wrote the fixes against, so treat them as a best case. Results: `evals/results/2026-11-04-rag-after-*.json`. CLI-reported usage: 180 calls, $0.54.

## Limits

- Made-up, small KB: 10 entries, 30 questions, 6 prospects.
- Run through the Claude Code CLI, not the live app, with no 350-token reply cap.
- The stand-in is not Gemini. Gemini may find reworded questions. It cannot fix the 500-character cut.
- Haiku answered Ask-KB, not the hard-coded Llama model (which the backend rejects except on OpenRouter).
- One AI vendor.
- A few answer-key patterns are loose (p02, p04, s13 would accept some wrong "yes" answers). None changed a result here; tighten them before reusing the set.

## What to do next

1. Rerun Ask-KB in the live app with each provider, now that the model fix is in.
2. Test Gemini search with a working key on this answer key, starting with the reworded questions.
3. Rerun the pitch pipeline after the long-entry change, and write new questions the fixes were never tuned on.
4. The model picker still offers some models the backend rejects by default (`claude-opus-4-7`, OpenRouter `anthropic/claude-3.5-sonnet`). Decide whether to hide them or allow them.

## Run it yourself

```sh
bun test ./evals/harness/rag.eval.ts --timeout 7200000   # all arms, 252 CLI calls
EVAL_ARMS=A bun test ./evals/harness/rag.eval.ts          # search only, no AI calls
```

Results are in `evals/results/2026-11-03-rag-*.json`. CLI-reported usage: Ask-KB 180 calls, $0.55; pitches 72 calls, $3.14. That is list-price usage on the CLI, not app cost.

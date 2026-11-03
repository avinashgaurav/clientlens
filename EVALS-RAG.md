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
| Gave a figure from a look-alike passage | 0 / 69 | 3 / 69 |
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
- **A cut passage gave a wrong answer.** "How fast do you respond if our staff are locked out of signing off payables?" Stand-in, all 3 runs, for example: "Support tickets have a first-response target of one business day." The answer is one hour. The passage it was shown starts just after the one-hour sentence.
- **Pitches cut long entries too**, at 1,500 characters. A prospect asked about "data retention and a clear exit plan". No deck gave the seven-year retention or the 30-day export, which sit past that cut. In one run the first role skipped that entry, yet the deck was verified and writable, with a slide titled "Clear Exit Path, No Lock-In Surprises" and no exit facts.
- **The fact check caught slips.** In 2 runs the drafter said the SOC 2 report was "available on request" or "under NDA". The KB says neither. Both decks were held.

## Bugs found in code (found by reading code, not fixed)

1. **Ask-KB fails unless the provider is OpenRouter.** It always asks for `meta-llama/llama-3.1-8b-instruct:free` (`extension/src/meeting-copilot/agents/live-agents.ts:617`) under the user's provider (`:615`). The backend allows that name only for OpenRouter (`backend/api/routes/llm.py:438-448`, checked at `:1011`). Calling that check directly gave 400 for Anthropic, Gemini and Groq, so the rep sees "Error reaching backend" (`live-agents.ts:637`).
2. **The default Anthropic model is blocked.** `extension/src/shared/agents/llm-client.ts:24` defaults to `claude-opus-4-7`. The backend's default Anthropic list (`llm.py:439`) lacks it; a direct check gave 400. It works only if `ALLOWED_MODELS_ANTHROPIC` is set.
3. **Keyword fallback** drops words of 3 letters or fewer (`live-agents.ts:148`), drops entries with no match (`:160`), and returns only the first 500 characters of the entry (`:167`).
4. **The meaning-based path also cuts at 500 characters** (`live-agents.ts:203`), though pieces are larger: the long entry's first piece was 1,794 characters.
5. **Ask-KB has no fact check**, though its comment says answers are validated (`live-agents.ts:584-585`).
6. **Live prompts skip the KB safety wrapper.** Coach, live checker and Ask-KB insert raw KB text (`live-agents.ts:347`, `:501`, `:607`). Pitches wrap it and tell the AI to ignore instructions inside (`council.ts:110`).
7. **`GEMINI_API_KEY` is missing from `backend/.env.example`** (it is only in `docs/configuration.md:36`).
8. **Pitch prompts cut each entry at 1,500 characters** (`extension/src/shared/agents/council.ts:110`), so neither drafter nor fact check sees the rest.

## Limits

- Made-up, small KB: 10 entries, 30 questions, 6 prospects.
- Run through the Claude Code CLI, not the live app, with no 350-token reply cap.
- The stand-in is not Gemini. Gemini may find reworded questions. It cannot fix the 500-character cut.
- Haiku answered Ask-KB, not the hard-coded Llama model (which the backend rejects except on OpenRouter).
- One AI vendor.

## What to do next

1. Fix bugs 1 and 2, then rerun Ask-KB in the live app.
2. Send the matching part of a piece, not its first 500 characters. Raise or replace the 1,500-character pitch cut.
3. Keep 3-letter terms in keyword search.
4. Test Gemini search with a working key on this answer key.

## Run it yourself

```sh
bun test ./evals/harness/rag.eval.ts --timeout 7200000   # all arms, 252 CLI calls
EVAL_ARMS=A bun test ./evals/harness/rag.eval.ts          # search only, no AI calls
```

Results are in `evals/results/2026-11-03-rag-*.json`. CLI-reported usage: Ask-KB 180 calls, $0.55; pitches 72 calls, $3.14. That is list-price usage on the CLI, not app cost.

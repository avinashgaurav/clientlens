# ClientLens search-and-answer test

## What was tested and why

I describe ClientLens as "multi-agent RAG": the app searches a knowledge base (the KB) for passages, then has an AI answer using only those passages. This test checks that claim against the code. What the code has: pitches come from 4 AI roles in a fixed order (pick sources, draft, brand check, fact check). Search by meaning (Gemini turns text into number fingerprints and compares them) exists only on the live call path: Ask-KB, the live coach and the live checker. That Gemini search had never been tested, and at first I could not test it: there was no Gemini key here. When it fails, the app falls back to keyword matching. I ran the test on 2026-11-03, and tested real Gemini search with a key on 2026-11-04 (see "Real Gemini search" below).

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
- Every Ask-KB quote must be at least 12 characters and copied exactly from a passage it was given, or the answer becomes "Not in KB.". In the rerun, all 75 and 78 quotes were exact copies, so the check had nothing to reject.
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

Every simple fact and every two-entry question is now right with both searches. What still fails is the reworded questions (p01, p02, p04, p05 wrong in every run): neither keyword search nor the word-count stand-in can match a question that shares no words with the answer. That is the job of real meaning-based search, which was still untested at this point (see the next section).

These after-fix numbers are on the same questions I wrote the fixes against, so treat them as a best case. Results: `evals/results/2026-11-04-rag-after-*.json`. CLI-reported usage: 180 calls, $0.54.

## Real Gemini search (2026-11-04)

With a working Gemini key I tested the real search on the code after the fixes. Meaning-based search works like this: Gemini turns the question and every KB piece into a list of 768 numbers that captures what the text means, and the app hands the AI the pieces whose numbers sit closest to the question's, even when they share no words.

- **Same test.** Same 10 entries, same 30 questions, same answer key (`rag.json` unchanged), same scoring rules.
- **Real code.** The app's chunker, ranking, Ask-KB and coach code ran unchanged. Only the embedding call was swapped: the test called Gemini `gemini-embedding-001` directly, with the same request the backend sends (768 numbers, no task type, up to 100 texts per call). The backend proxy itself was bypassed.
- **Ask-KB answers.** `claude-haiku-4-5-20251001` through the Claude Code CLI, 3 runs, as before.

**Search only** (right entry in results / key text inside what the AI sees / right entry ranked first; all 23 answerable questions, then the 5 reworded ones)

| Search | Ask-KB, all 23 | Ask-KB, reworded 5 | Coach, all 23 | Coach, reworded 5 |
|---|---|---|---|---|
| Keyword fallback, after fixes | 18 / 18 / 16 | 1 / 1 / 1 | 18 / 17 / 15 | 1 / 0 / 0 |
| Word-count stand-in, after fixes | 19 / 18 / 19 | 2 / 1 / 1 | 20 / 17 / 17 | 2 / 0 / 0 |
| Real Gemini | **23 / 22 / 23** | **5 / 4 / 5** | **23 / 20 / 21** | **5 / 3 / 3** |

**Ask-KB end to end** (3 runs: 69 tries on answerable questions, 21 on the rest)

| Measure | Keyword after fixes | Stand-in after fixes | Real Gemini |
|---|---|---|---|
| Right answer | 57 / 69 | 57 / 69 | **66 / 69** |
| ...simple facts | 45 / 45 | 45 / 45 | 45 / 45 |
| ...reworded | 3 / 15 | 3 / 15 | **12 / 15** |
| ...needing two entries | 9 / 9 | 9 / 9 | 9 / 9 |
| Said "Not in KB." though the KB had it | 12 / 69 | 9 / 69 | 3 / 69 |
| Wrong figure from a cut passage | 0 / 69 | 0 / 69 | 0 / 69 |
| Unanswerable handled right | 21 / 21 | 21 / 21 | 21 / 21 |
| Quotes copied exactly from what it saw | 75 / 75 | 78 / 78 | 87 / 87 |
| Right answer when the key text reached it | 54 / 54 | 54 / 54 | 66 / 66 |

**The reworded questions, the open question from before: real Gemini search finds them.** It put the right entry first for all 5, and Ask-KB went from 3 of 15 to 12 of 15. p02, p04 and p05, wrong in every run with both earlier searches, were right in all 3 runs, and p03 stayed right. One reworded question still fails: p01 ("How fast do you respond if our staff are locked out of signing off payables?") got "Not in KB." in all 3 runs. Gemini ranked the right piece first, but that piece is 1,794 characters long and the answer starts at character 1,523. The app sends a 500-character window of it, chosen by words the question shares with the piece (`extension/src/shared/utils/passage.ts`). This question shares none, so the window is the piece's first 500 characters, and the one-hour answer never reached the AI. Search now works for reworded questions; the window cut is what is left.

Other results:

- Gemini always returns a full top 6, even for questions the KB cannot answer. The AI still said exactly "Not in KB." on all 12 unanswerable tries and denied all 9 traps.
- The quote check rejected 0 answers: all 87 quotes were exact copies.
- Coach misses: the key text fell outside the 240-character window for p01, p03 and m02, and p02 and p03 had the right entry second.

Gemini usage per full run: 61 calls (one call for the 11 KB pieces, then one per question for Ask-KB and the coach), 0 rate-limit retries, 0 errors. I ran it twice: the first run's results file had a summary bug in the test code (fixed), so I discarded it. By my notes from that run, its answers scored the same (66 / 69, with the same 3 p01 misses); its files were not kept, so that cannot be checked here.

Limits of this test:

- Same 30 questions, and the fixes were tuned on them, so treat these numbers as a best case.
- Tiny KB: 11 pieces in all, and Ask-KB returns 6, so "right entry in results" is easy here. "Ranked first" and "key text inside what the AI sees" are the stricter measures.
- The backend proxy was bypassed: a direct call with the same model and settings. The test also retried on rate limits and reused embeddings within a run; the backend does neither. Neither changes the vectors (0 retries happened).
- One embedding model, one setting (no task type).
- Haiku answered through the Claude Code CLI, not the live app, with no 350-token reply cap.

## Results on new cases (2026-11-04)

Every number above comes from the 30 questions I wrote the fixes against, so they are a best case. To check them, I wrote a second test set the code was never tuned on and ran the same tests on it.

- **New test data** (`evals/datasets/rag-new.json`). A new made-up KB of 10 entries about a different product: Tidewell Dispatch, a scheduling app for heating and plumbing contractors, by Orrinmoor Systems. No people, products or wording from the Lumora Ledger set. One long entry (2,141 characters) holds key facts past character 1,000, four of them past 1,500. Two pricing entries look alike ($39 and $64 per technician), and so do the two case studies. Some facts use 3-letter terms (SMS, ETA, GPS, API, CRM, TAM). One entry lists what the product does not do, and the security entry says the SOC 2 Type II audit is not finished. 31 questions: 16 simple facts, 5 reworded to share no key words with the answer, 3 needing two entries, and 7 the KB cannot answer (3 are traps the KB denies, like the year of that SOC 2 Type II audit). Plus 6 new pitch prospects.
- **Answers first.** I committed the questions and answer key ("Add new test cases and answer key, before any model call") before any AI or Gemini call.
- **Same code, models and scoring.** The code after the fixes, unchanged. Same scoring rules, written as fixed code checks. Search by keyword, word-count stand-in and real Gemini (`gemini-embedding-001`, called directly as before). Ask-KB answered by `claude-haiku-4-5-20251001`, 3 runs, with keyword search and with Gemini (not with the stand-in). Pitches by `claude-opus-4-7` for all 4 roles, 1 run only, to keep cost down. All AI calls went through the Claude Code CLI.

**Search only** (right entry in results / key text inside what the AI sees / right entry ranked first)

| Search | Tuned set, Ask-KB (23) | New set, Ask-KB (24) | New set, reworded only (5) | Tuned set, coach (23) | New set, coach (24) |
|---|---|---|---|---|---|
| Keyword fallback | 18 / 18 / 16 | 21 / 20 / 20 | 2 / 1 / 2 | 18 / 17 / 15 | 21 / 19 / 20 |
| Word-count stand-in | 19 / 18 / 19 | 23 / 21 / 21 | 4 / 2 / 2 | 20 / 17 / 17 | 23 / 20 / 21 |
| Real Gemini | 23 / 22 / 23 | **24 / 23 / 23** | **5 / 4 / 5** | 23 / 20 / 21 | 24 / 21 / 23 |

**Ask-KB end to end** (tuned set: 69 tries on answerable questions and 21 on the rest; new set: 72 and 21)

| Measure | Keyword, tuned | Keyword, new | Gemini, tuned | Gemini, new |
|---|---|---|---|---|
| Right answer | 57 / 69 | **60 / 72** | 66 / 69 | **67 / 72** |
| ...simple facts | 45 / 45 | 48 / 48 | 45 / 45 | 48 / 48 |
| ...reworded | 3 / 15 | 3 / 15 | 12 / 15 | 12 / 15 |
| ...needing two entries | 9 / 9 | 9 / 9 | 9 / 9 | 7 / 9 |
| Said "Not in KB." though the KB had it | 12 / 69 | 12 / 72 | 3 / 69 | 4 / 72 |
| Unanswerable handled right | 21 / 21 | 21 / 21 | 21 / 21 | 21 / 21 |
| Answers turned into "Not in KB." by the quote check | 0 | 0 | 0 | 2 |
| Right answer when the key text reached it | 54 / 54 | 60 / 60 | 66 / 66 | 67 / 69 |
| Right answers per run | 19, 19, 19 | 20, 20, 20 | 22, 22, 22 | 22, 22, 23 |

The results held on questions the code was never tuned on: about 83% right with keyword search on both sets (57 of 69, 60 of 72), and 96% and 93% with Gemini (66 of 69, 67 of 72). Every simple fact was right in every run. With both searches the AI said exactly "Not in KB." on all 12 unanswerable tries and turned down all 9 traps, and every quote it kept was copied exactly from what it saw (78 of 78 with keywords, 84 of 84 with Gemini).

What still fails:

- **Keyword search still misses reworded questions.** n-p01, n-p02, n-p03 and n-p05 got "Not in KB." in all 3 runs, for example "Can we run the software on machines in our own office?" (the KB says it "cannot be hosted on-premises"). Gemini got n-p02, n-p03, n-p04 and n-p05 right in all 3 runs.
- **The same passage window miss as p01 in the first set.** n-p01: "If our crews can't get their assignments at 2am, how quickly will someone reply?" The answer, 30 minutes, sits at character 1,529 of the long entry. Gemini ranked that piece first in every run, but the 500-character window the AI sees is picked by shared words, and the question shares none with that sentence. Two runs said "Not in KB."; the third quoted the four-business-hours rule and said the KB does not cover urgent cases, which my check scores wrong. This is item 3 in "What to do next", now seen on a second set.
- **The quote check threw away 2 right answers.** n-m01 asked how the two plans compare on price. With Gemini, in 2 of 3 runs Haiku gave the right answer ($39 and $64) but its quote joined two sentences of the Fleet entry and skipped the one in between. The check only accepts exact copies, so the rep would have seen "Not in KB.". The check did what it was built to do; the cost here was 2 right answers lost in 93 Gemini tries.

**Pitch pipeline, 1 run** (6 decks; the tuned set had 3 runs, 18 decks)

| Measure | Tuned set | New set |
|---|---|---|
| Right sources picked by the first role | 23 / 24 | 7 / 7 |
| Decks with every right source picked | 17 / 18 | 6 / 6 |
| Status: verified / redacted / held for review | 12 / 1 / 5 | 5 / 0 / 1 |
| Decks allowed to be written to a doc | 13 / 18 | 5 / 6 |
| Writable decks matching a false-claim pattern | 0 / 13 | 0 / 5 |

My automatic checks flagged 2 writable decks for figures not in the KB. These flags were read by an AI reviewer (Claude Opus 5.5), not by me: one deck printed the brand colour "#335577" as slide text again, and one worked out "90 techs = $5,760/month, ~$69,120/year" from the $64 Fleet price, which is correct arithmetic but not a KB figure. The held deck (n-c02) was held because the fact check could not back "Reduces PCI scope on your integration surface", a reading of the KB's line that card payments go through a separate processor. The long-entry fix worked on new data: the data-retention deck (n-c06) gave five years, 14 days and 60 days, all past character 1,500 of the long entry.

Limits of this check:

- Still small and made up: 10 entries, 31 questions, 6 prospects, one AI vendor. I wrote both sets, so they share my habits.
- The pitch pipeline ran once, not 3 times, so its numbers have no run-to-run spread.
- The stand-in was scored on search only; Ask-KB ran with keyword search and Gemini.
- Same set-up limits as above: Claude Code CLI with no 350-token reply cap, and the backend's Gemini proxy bypassed. Gemini made 63 calls with 0 retries and 0 errors.

Results: `evals/results/2026-11-04-rag-new-*.json`. CLI-reported usage: Ask-KB 186 calls, $0.59; pitches 24 calls, $1.05.

## Limits

- Made-up, small KB: 10 entries, 30 questions, 6 prospects.
- Run through the Claude Code CLI, not the live app, with no 350-token reply cap.
- The stand-in is not Gemini. Gemini may find reworded questions. It cannot fix the 500-character cut.
- Haiku answered Ask-KB, not the hard-coded Llama model (which the backend rejects except on OpenRouter).
- One AI vendor.
- A few answer-key patterns are loose (p02, p04, s13 would accept some wrong "yes" answers). None changed a result here; tighten them before reusing the set.

## What to do next

1. Rerun Ask-KB in the live app with each provider, now that the model fix is in.
2. Rerun the pitch pipeline 3 times on both test sets (the new set got 1 run; see "Results on new cases").
3. Pick the passage window by meaning, not only by shared words. With real Gemini search, the right piece for p01 ranked first, but the answer sits past the 500-character window the AI sees, so it said "Not in KB." in all 3 runs.
4. The model picker still offers some models the backend rejects by default (`claude-opus-4-7`, OpenRouter `anthropic/claude-3.5-sonnet`). Decide whether to hide them or allow them.

## Run it yourself

```sh
bun test ./evals/harness/rag.eval.ts --timeout 7200000   # all arms, 252 CLI calls
EVAL_ARMS=A bun test ./evals/harness/rag.eval.ts          # search only, no AI calls
EVAL_ARMS=D bun test ./evals/harness/rag.eval.ts --timeout 7200000   # real Gemini search, then Ask-KB; needs GEMINI_API_KEY
EVAL_DATASET=rag-new.json EVAL_ARMS=A bun test ./evals/harness/rag.eval.ts   # the new test set; results files are named rag-new-*
```

Results are in `evals/results/2026-11-03-rag-*.json`. CLI-reported usage: Ask-KB 180 calls, $0.55; pitches 72 calls, $3.14. That is list-price usage on the CLI, not app cost.

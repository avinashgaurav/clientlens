# Content audit — user-facing copy (#85)

**Status:** inventory of rep-facing strings, tagged against `voice.md`. Drives the sweep PRs. **Tag key:** KEEP (on-voice), REWRITE (fix per voice guide), KILL (remove jargon entirely).

Scope note: this audit covers strings *rendered to the user*. Code comments and internal identifiers (e.g. the literal `runCouncil`, `validatorAgent` function names) are NOT user-facing and are out of scope — renaming code symbols is not a copy task.

## Terse error messages → REWRITE (instructive)

| File:line | Current | → Rewrite |
|---|---|---|
| `hooks/useEmailCouncil.ts:32` | "Missing email input" | "Add the recipient and context, then draft again." |
| `hooks/useObjection.ts:23` | "No objection text" | "Paste the prospect's objection first." |
| `hooks/useCouncil.ts:31` | "Missing personalization input or brand assets" | "Fill the company and persona, then generate." |
| `shared/agents/council.ts:530` | "Council could not produce a draft. Issues: …" | "The council couldn't ground a draft — add a KB entry covering this, then retry. (…)" |

These four are the first sweep (this PR). The `detail:` strings in `MeetingCopilotPanel` (lines 188/216/276/420) are already instructive and on-voice — KEEP.

## Technical jargon in user-facing text → KILL / REWRITE

Most hits for "RAG" (92), "namespace" (51), "validator" (2) are in **comments and code**, not rendered text. The rendered-text offenders to fix:

| Where | Term | Action |
|---|---|---|
| Any tooltip / label rendering "validator" to the rep | validator | REWRITE → "fact-check" / "the agent that checks your numbers" |
| KB UI strings exposing "namespace" as a user label | namespace | REWRITE → "category" (the UI already uses "Category" in the Add form — align stragglers) |
| Any rep-facing "RAG" / "embedding" / "orchestrator" | — | KILL (none found in rendered copy on a first pass; flag if any surface in a sweep) |
| "ICP" in rep-facing (non-admin) copy | ICP | REWRITE → "buyer persona" in rep flows; KEEP in KB/admin surfaces |

## On-voice already → KEEP (no change)

- Eyebrow labels (`OUTPUT FORMAT`, `THIS WEEK`, `RECENT CALLS`, etc.) — uppercase, on-brand.
- "council" / agent names by job (Sentiment, Coach, Objection) — the differentiator.
- "Knowledge base" / "KB" naming.
- `MeetingCopilotPanel` transponder/calendar `detail:` strings — already instructive.
- Integrations test-result strings (`integrations.ts`) — already concrete + instructive ("Fill API domain, client ID/secret…").

## Sweep plan

1. **PR #103 (done):** the 4 terse error rewrites + the voice guide + this audit.
2. **Per-area sweeps (#104–#107) — outcomes:**

| # | Area | Outcome |
|---|---|---|
| #104 | Generate tab | **2 fixes:** ICPSelector "ICP Profile" → "Buyer persona" (rep-facing); custom-doc helper "the orchestrator infers" → "Wingman infers". Output-format card descriptions already concrete/on-voice — kept. |
| #105 | Live Copilot | **1 fix:** transponder confidence tooltip "Validator confidence" → "Fact-check confidence". Agent stage labels (Sentiment/Agenda/Coach/Objection) already job-named — kept. Rest of "validator/orchestrator" hits are code comments, not rendered. |
| #106 | KB tab | **Already compliant.** Rendered label is "Category" (the `namespace` is a code identifier only). "ICP Profiles" as a KB category is acceptable per voice.md — KB is an admin/PMM-gated surface where ICP is expected. No change. |
| #107 | Settings + integrations | **Already compliant.** No filler adjectives or plumbing jargon; integration result strings already instructive. No change. |

Net: the prior copy was in better shape than feared. Real offenders were concentrated in Generate (#104) + one transponder tooltip (#105); KB and Settings were already on-voice. No changes manufactured just to produce a diff.

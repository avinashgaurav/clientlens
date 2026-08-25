# Wingman voice guide

**Status:** source of truth for user-facing copy. Decisions locked with the product owner. Drives the content audit (`content-audit.md`) and the per-area sweep PRs under #85.

## Audience

B2B sales reps. Often reading **one-handed, mid-call**, under time pressure. They are not engineers. Copy should be concrete, fast to scan, and never make them feel they need a CS degree.

## The four locked decisions

### 1. Keep "council" and "agents": they're a differentiator

Multi-agent framing is a real edge over monolithic copilots: *"5 specialists checking your pitch"* beats *"an AI."* So **keep** these in rep-facing copy:
- ✅ "council" (the headline concept)
- ✅ "agents" (sentiment, coach, objection, etc. name them by job)

But **kill the plumbing vocabulary**, it's machinery the rep doesn't need:
- ❌ "validator" → say "fact-check" / "the agent that checks your numbers"
- ❌ "orchestrator" → never user-visible (it's an internal term)
- ❌ "RAG" → "grounded in your KB" / "cites your sources"
- ❌ "embedding" / "namespace" / "index" → never user-visible
- ❌ "ICP" → "buyer persona" / "the role you're selling to" (keep ICP only in admin/KB-power-user surfaces where the term is expected)

Rule of thumb: name an agent by **what it does for the rep**, not its implementation. "The objection agent drafts your comeback" ✅. "The RAG retrieval agent queries the vector store" ❌.

### 2. Eyebrow labels stay ALL-CAPS

The small mono kickers (`OUTPUT FORMAT`, `THIS WEEK`, `RECENT CALLS`) stay uppercase. This is the PostHog/Linear design-lineage signature baked into the `.eyebrow` class and matches the design-md sources. Do not sentence-case them, it weakens the skin fidelity locked in PR #101.

### 3. Error messages are instructive

Short, no apology, no jargon, **always end with the fix**. Format: *what happened, what to do.*

| Before | After |
|---|---|
| "Missing email input" | "Add the recipient and context, then draft again." |
| "No objection text" | "Paste the prospect's objection first." |
| "Missing personalization input or brand assets" | "Fill the company and persona, then generate." |
| "Council could not produce a draft. Issues: …" | "The council couldn't ground a draft, add a KB entry covering this, then retry. (…)" |

Keep "council" (per decision 1) but make the next step obvious. Mid-call, the rep needs the fix in the first glance.

### 4. The Knowledge Base stays "Knowledge base" / "KB"

Familiar, neutral, reps know it. No rename to "playbook" or "sources." (The one existing "sales playbook" phrasing in the KB empty-state heading is fine as flavor copy, but the canonical noun is "Knowledge base.")

## General tone rules

- **Concrete over clever.** "Drafts your comeback in 3 seconds" > "Supercharge your objection handling."
- **Active voice, second person.** "You closed it." / "Wingman coaches you live."
- **No filler adjectives.** Avoid "powerful," "seamless," "robust," "cutting-edge."
- **Numbers stay honest.** Every stat needs a baseline or a methodology (carried over from the landing-page accuracy work).
- **Sentence case for everything except eyebrows.** Headings, buttons, body, sentence case.

## What this guide does NOT change

- Eyebrow casing (stays uppercase)
- The "council"/"agents" concept (stays)
- "Knowledge base" / "KB" naming (stays)
- Design tokens, layout, skins (out of scope, this is copy only)

# Features in detail

Every surface, in full. For the short version see the [README](../README.md).

## Features in detail

### 1. Personalized Pitch Generation

A multi-agent pipeline that turns "company name + ICP" into a structured pitch.

- **Page-context capture**: the content script reads the current tab (LinkedIn profile, company website, press release) and extracts company name, role hints, and industry signals.
- **ICP selector**: pick the persona you're pitching to: CFO, CTO, VP Sales, RevOps, or generic. Each profile drives a different tone, ROI framing, and feature emphasis.
- **Personalization form**: manual overrides for company name, contact, industry, key pain points, custom notes. Everything is editable before generation.
- **Council pipeline** runs four agents in sequence:
  1. **Retrieval Agent**: pulls the most relevant chunks from your KB via Pinecone (or in-browser vector store) using cosine similarity over Gemini embeddings.
  2. **ICP Personalization Agent**: drafts a ${persona}-tailored deck grounded only in the retrieved sources. No inventing customers, savings figures, or quotes.
  3. **Brand Compliance Agent**: checks the draft against your voice guidelines (banned hype words: "revolutionary", "game-changing", "best-in-class", "world-class", "synergy", "cutting-edge"; required factual baseline).
  4. **Validation Agent**: fact-checks every numeric claim against a `source_id` citation. Rejects unsourced numbers.
- **Output formats**: on-screen presentation, one-pager, detailed doc, or analysis-style writeup (configurable per generation).
- **Streaming UI**: `GenerationProgress` shows live stage transitions ("Retrieving sources…", "Checking brand compliance…", "Validating claims…") so the rep knows what's happening.

### 2. Live Meeting Copilot

A Google Meet companion that captures tab audio, transcribes it in real time, and surfaces coaching cues both in the sidebar and as an in-Meet overlay.

- **Tab audio capture**: uses the Chrome Offscreen API to record the active tab. Audio is processed by an `AudioWorklet` (`audio-processor.js`) and streamed to Deepgram via WebSocket.
- **Real-time STT**: Deepgram Nova-2 streaming model. Mock STT module available for UI dev without an API key.
- **Live agents** running on the rolling transcript:
  - **Sentiment Agent**: reads the prospect's tone every N seconds (positive / neutral / negative + intensity).
  - **Agenda Agent**: tracks topics covered vs. the planned agenda; warns "you're 12 minutes in and haven't done discovery."
  - **Coach Agent**: surfaces the next-best-sentence and objection handles when the prospect pushes back.
  - **Council Validator**: fact-checks any number the rep is about to say.
- **In-Meet transponder**: a non-intrusive overlay on `meet.google.com` that shows the company name chip, sentiment, and the current coaching cue. Designed not to steal focus during a live call.
- **Post-call summary**: once the call ends, a structured summary is generated: agenda coverage, sentiment timeline, key objections raised, action items, sourced quotes.
- **CRM push:** one click to write the summary as a note in Zoho CRM under the prospect's record. Backed by RBAC-gated server-side OAuth (see [Security model](security.md)). **Zoho is the only CRM wired today**; HubSpot and Salesforce connectors are on the [roadmap](../README.md#roadmap) and not implemented. The Integrations panel shows Meet and Zoom cards for parity, but Google Meet is the only meeting surface that works end to end.
- **Calendar sync**: Google Calendar integration pre-populates upcoming meetings so the copilot is primed when the call starts.

### 3. Objection Composer

A purpose-built mid-call surface for "the prospect just said X, what do I say?"

- **Invoke two ways:** right-click any selected text on a page → context menu **"Project Wingman: Handle objection"**, OR open the Generate tab and pick Objection mode.
- **2-agent pipeline:**
  - **Retrieval Agent**: pulls the most relevant battlecard / case study / compliance entries from your KB.
  - **Respond Agent**: drafts a 60–120 word grounded reply, emitting inline `[N]` citation markers tied to each cited claim.
- **Composer renderer**: single card. Inline `[N]` chips render next to each supporting claim; hover shows the source quote in a tooltip, and screen readers announce the source + quote via `aria-label` on Tab focus. `Copy reply` strips the markers so paste-into-Slack stays clean.
- **▾ Why this answer disclosure**: collapsed by default for mid-call use. Expands for post-call review, showing each citation with its source and exact quote.
- **Parse-fail safety net**: if the LLM emits malformed markers (out-of-bounds, too many invalid), the renderer falls back to a flat citations card so the rep never sees a broken response. Telemetry tracks the fallback rate.
- **Feature flag**: `clientlens_objection_composer_v2` in `chrome.storage.local` (default `true`). `?composer=v1` URL param forces the legacy renderer for one panel lifetime, useful for live debugging. Note: Chrome side panels reset to the manifest `default_path` on re-open, so URL params don't survive closing and reopening the panel. For a sticky override, use `chrome.storage.local.set({clientlens_objection_composer_v2: false})`.

### 4. Email Council

For follow-ups and cold outreach.

- Three modes: **Cold intro** (pattern-match to a specific outcome), **Follow-up** (references the last touchpoint), **Re-engage** (reactivates cold leads).
- Council of agents:
  - **Email Drafting Agent**: produces concise, grounded copy. Every numeric claim cites a `source_id`. No hype words.
  - **Brand Compliance Agent**: scores the email against your brand voice. Banned word detection.
  - **Tone Calibration Agent**: adjusts for the recipient's ICP profile.
- Output is strict JSON; the sidebar renders it as a copyable email.

### 5. Knowledge Base & RAG

Your sales team's source of truth, indexed and searchable.

- **In-browser KB**: designers and PMMs upload case studies, battle cards, pricing PDFs, brand guides directly into the extension. Stored in `chrome.storage.local`, chunked, embedded with Gemini, and indexed in an in-browser vector store (HNSW).
- **Backend KB**: for larger orgs, the FastAPI backend uses Pinecone (index name configurable via `PINECONE_INDEX`).
- **Embedding cost guardrails**: embedding generation is gated and de-duplicated; the recent "embeddings money-leak fix" added per-tenant rate limiting.
- **Usage Meter**: sidebar shows current KB size with a 10 MB soft limit warning.

### 6. ICP Profiles

| Profile | Tone | Content emphasis | Banned moves |
|---|---|---|---|
| **CFO** | Numbers-first, hedged | Payback period, ROI breakdown, hidden costs | Big "transformation" promises |
| **CTO** | Technical depth | Architecture, security posture, integration surface, scaling characteristics | Marketing-speak, generic benefits |
| **VP Sales** | Outcome-focused | Win rates, ACV uplift, competitive displacement, case studies | Implementation detail dumps |
| **RevOps** | Process-focused | Workflow automation, attribution, integration hygiene | Pure technical depth |
| **General** | Balanced | High-level value props, social proof | Persona-specific assumptions |

### 7. Multi-Provider LLM Layer

The extension never holds an LLM key. All provider calls go through the FastAPI backend's `/api/v1/llm/*` routes.

- **Anthropic**: Claude Sonnet / Opus / Haiku. Default for council validation.
- **Gemini**: generous free tier on Flash; default for embeddings.
- **Groq**: Llama 3.3 70B for ultra-fast, low-cost inference.
- **OpenRouter**: gateway to any model (Llama, DeepSeek, GPT, Claude, Gemini); attribution via `OPENROUTER_REFERER` and `OPENROUTER_TITLE`.
- **Custom**: any OpenAI-compatible endpoint (Ollama, vLLM, your own deployment).

The `ModelPicker` in the sidebar lets each user pick their preferred provider/model. The `model-catalog.ts` surface drives the dropdown.

### 8. Roles & RBAC

Backed by Supabase RLS and a `rbac/roles.py` permission matrix on the backend.

> [!WARNING]
> **In v1.0 this matrix is effectively dormant.** The permission checks are real and they run, but because auth is not wired (see [Security model](security.md)), the extension self-assigns the `admin` role and the backend runs in `DEV_MODE`, treating every caller as a stub admin. The table below describes the intended model and what the code enforces once a real JWT is present, not what constrains a user today.

| Role | Capabilities |
|---|---|
| **Designer** | Upload/update Design System tokens, manage templates |
| **PMM** | Update Brand Voice, manage messaging framework, banned word list |
| **Sales Rep** | Generate pitches, use meeting copilot, access KB, push to CRM |
| **Admin** | Everything above + user management + KB wipe + RBAC editing |

Critical operations are permission-gated:
- `crm:connect`: minting Zoho OAuth tokens with full CRM scope. Restricted to `ADMIN`, `SALES_REP`. A viewer-role JWT cannot exchange the server's client_secret for an access_token.

### 9. Settings & Onboarding

- **Onboarding Checklist**: 3-step flow: add a model API key, connect one integration (optional), add at least one KB entry. Renders at the top of the panel while incomplete; once complete, collapses to a small "Set up" pill at the bottom so it stops eating real estate.
- **Quick Settings popover**: a sliders icon in the header opens a passcode-free popover with the reps' most-changed settings: LLM provider, model, deep-research toggle, sample-data toggle. The full Settings panel stays behind the admin passcode.
- **Sample data toggle**: one click loads 5 sample KB entries + 4 sample call records (prefix-tagged `demo_kb_*` / `demo_call_*`). Toggle off to remove them; real data is untouched. Useful for cold-start demoing without seeding real content.
- **Admin Gate**: full Settings panel is protected by an SHA-256-hashed passcode stored in `localStorage`. Set once from the Admin tab, then required for sensitive ops (KB wipe, role changes, integration disconnects, API key changes).
- **Integrations panel**: per-card config for Zoho CRM, Google Meet, Zoom (Meet/Zoom captured for parity; primary integration is Google Meet today).
- **Mock mode**: `VITE_MOCK_MODE=true` short-circuits all LLM calls to canned responses for offline UI development.

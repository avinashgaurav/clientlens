<div align="center">

# Project Wingman

**The AI sales copilot that lives in your browser sidebar.**

Generate personalized pitches, copilot live Google Meet calls in real time, handle objections, and push it all back to your CRM — without ever switching tabs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)](https://fastapi.tiangolo.com)
[![BYOL](https://img.shields.io/badge/LLM-Bring%20Your%20Own%20Keys-F58549)](#configuration)

</div>

---

> [!IMPORTANT]
> **At a glance**
>
> | | |
> |---|---|
> | **What** | Chrome side-panel extension + FastAPI backend for B2B sales reps |
> | **Surfaces** | Generate (pitch / email / objection) · Live Meeting Copilot · Post-call Insights · in-Meet transponder · popup launcher |
> | **AI** | Multi-agent "council" (retrieval → ICP personalization → brand → fact-check) over a Pinecone RAG knowledge base |
> | **LLMs** | Bring-your-own-keys — Anthropic · Gemini · Groq · OpenRouter · any OpenAI-compatible endpoint |
> | **Privacy** | Local-first. The extension never holds an LLM key; keys live in the backend. Call data goes only to *your* configured provider, never to a Wingman server. |
> | **License** | [MIT](LICENSE) |
> | **Status** | [**v1.0.0**](https://github.com/avinashgaurav/project-wingman-sales-copilot/releases/tag/v1.0.0), open beta. Self-hosted, load unpacked. No Chrome Web Store listing yet. |
> | **Auth** | **Not wired.** Single-user by design today: the sidebar provisions a local admin and the backend runs in `DEV_MODE`. Keep the backend off the public internet. See [Security model](#security-model). |

Behind the sidebar sits a FastAPI backend with a multi-agent RAG pipeline, a Pinecone-backed knowledge base, Deepgram speech-to-text, and pluggable LLM providers. The product is deliberately **bring-your-own-keys**: the extension talks to the backend over HTTPS, and the backend proxies to the provider of your choice.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Features in detail](#features-in-detail)
3. [Architecture](#architecture)
4. [Project structure](#project-structure)
5. [Quick start](#quick-start)
6. [Configuration](#configuration)
7. [Development guide](#development-guide)
8. [Security model](#security-model)
9. [Tech stack](#tech-stack)
10. [Roadmap](#roadmap)
11. [Contributing](#contributing)
12. [License](#license)

---

## What it does

A sales rep's typical hour: jump into Google Meet, lose track of the agenda, fumble the objection, take a half-page of notes, paste them into the CRM, then forget to send the follow-up pitch. Wingman compresses that loop:

- **Pre-call** — generate a personalized pitch deck and a tailored email for the prospect using their public signals and your indexed knowledge base.
- **During the call** — a real-time sidebar surfaces talking points, objection handles, agenda pacing, and a sentiment read on the prospect. A small in-Meet transponder overlays the same suggestions on the meeting tab.
- **After the call** — a post-call summary is generated, pushed into Zoho CRM with one click, and a follow-up email is drafted from the council of email-writing agents.

The product is deliberately **bring-your-own-keys**. The extension never holds an LLM provider key in the browser; all keys live in the FastAPI backend's `.env`. The extension talks to the backend over HTTPS, and the backend proxies to the LLM provider of your choice.

---

## Features in detail

### 1. Personalized Pitch Generation

A multi-agent pipeline that turns "company name + ICP" into a structured pitch.

- **Page-context capture** — the content script reads the current tab (LinkedIn profile, company website, press release) and extracts company name, role hints, and industry signals.
- **ICP selector** — pick the persona you're pitching to: CFO, CTO, VP Sales, RevOps, or generic. Each profile drives a different tone, ROI framing, and feature emphasis.
- **Personalization form** — manual overrides for company name, contact, industry, key pain points, custom notes. Everything is editable before generation.
- **Council pipeline** runs four agents in sequence:
  1. **Retrieval Agent** — pulls the most relevant chunks from your KB via Pinecone (or in-browser vector store) using cosine similarity over Gemini embeddings.
  2. **ICP Personalization Agent** — drafts a ${persona}-tailored deck grounded only in the retrieved sources. No inventing customers, savings figures, or quotes.
  3. **Brand Compliance Agent** — checks the draft against your voice guidelines (banned hype words: "revolutionary", "game-changing", "best-in-class", "world-class", "synergy", "cutting-edge"; required factual baseline).
  4. **Validation Agent** — fact-checks every numeric claim against a `source_id` citation. Rejects unsourced numbers.
- **Output formats** — on-screen presentation, one-pager, detailed doc, or analysis-style writeup (configurable per generation).
- **Streaming UI** — `GenerationProgress` shows live stage transitions ("Retrieving sources…", "Checking brand compliance…", "Validating claims…") so the rep knows what's happening.

### 2. Live Meeting Copilot

A Google Meet companion that captures tab audio, transcribes it in real time, and surfaces coaching cues both in the sidebar and as an in-Meet overlay.

- **Tab audio capture** — uses the Chrome Offscreen API to record the active tab. Audio is processed by an `AudioWorklet` (`audio-processor.js`) and streamed to Deepgram via WebSocket.
- **Real-time STT** — Deepgram Nova-2 streaming model. Mock STT module available for UI dev without an API key.
- **Live agents** running on the rolling transcript:
  - **Sentiment Agent** — reads the prospect's tone every N seconds (positive / neutral / negative + intensity).
  - **Agenda Agent** — tracks topics covered vs. the planned agenda; warns "you're 12 minutes in and haven't done discovery."
  - **Coach Agent** — surfaces the next-best-sentence and objection handles when the prospect pushes back.
  - **Council Validator** — fact-checks any number the rep is about to say.
- **In-Meet transponder** — a non-intrusive overlay on `meet.google.com` that shows the company name chip, sentiment, and the current coaching cue. Designed not to steal focus during a live call.
- **Post-call summary** — once the call ends, a structured summary is generated: agenda coverage, sentiment timeline, key objections raised, action items, sourced quotes.
- **CRM push:** one click to write the summary as a note in Zoho CRM under the prospect's record. Backed by RBAC-gated server-side OAuth (see [Security model](#security-model)). **Zoho is the only CRM wired today**; HubSpot and Salesforce connectors are on the [roadmap](#roadmap) and not implemented. The Integrations panel shows Meet and Zoom cards for parity, but Google Meet is the only meeting surface that works end to end.
- **Calendar sync** — Google Calendar integration pre-populates upcoming meetings so the copilot is primed when the call starts.

### 3. Objection Composer

A purpose-built mid-call surface for "the prospect just said X, what do I say?"

- **Invoke two ways:** right-click any selected text on a page → context menu **"Project Wingman: Handle objection"**, OR open the Generate tab and pick Objection mode.
- **2-agent pipeline:**
  - **Retrieval Agent** — pulls the most relevant battlecard / case study / compliance entries from your KB.
  - **Respond Agent** — drafts a 60–120 word grounded reply, emitting inline `[N]` citation markers tied to each cited claim.
- **Composer renderer** — single card. Inline `[N]` chips render next to each supporting claim; hover shows the source quote in a tooltip, and screen readers announce the source + quote via `aria-label` on Tab focus. `Copy reply` strips the markers so paste-into-Slack stays clean.
- **▾ Why this answer disclosure** — collapsed by default for mid-call use. Expands for post-call review, showing each citation with its source and exact quote.
- **Parse-fail safety net** — if the LLM emits malformed markers (out-of-bounds, too many invalid), the renderer falls back to a flat citations card so the rep never sees a broken response. Telemetry tracks the fallback rate.
- **Feature flag** — `clientlens_objection_composer_v2` in `chrome.storage.local` (default `true`). `?composer=v1` URL param forces the legacy renderer for one panel lifetime — useful for live debugging. Note: Chrome side panels reset to the manifest `default_path` on re-open, so URL params don't survive closing and reopening the panel. For a sticky override, use `chrome.storage.local.set({clientlens_objection_composer_v2: false})`.

### 4. Email Council

For follow-ups and cold outreach.

- Three modes: **Cold intro** (pattern-match to a specific outcome), **Follow-up** (references the last touchpoint), **Re-engage** (reactivates cold leads).
- Council of agents:
  - **Email Drafting Agent** — produces concise, grounded copy. Every numeric claim cites a `source_id`. No hype words.
  - **Brand Compliance Agent** — scores the email against your brand voice. Banned word detection.
  - **Tone Calibration Agent** — adjusts for the recipient's ICP profile.
- Output is strict JSON; the sidebar renders it as a copyable email.

### 5. Knowledge Base & RAG

Your sales team's source of truth, indexed and searchable.

- **In-browser KB** — designers and PMMs upload case studies, battle cards, pricing PDFs, brand guides directly into the extension. Stored in `chrome.storage.local`, chunked, embedded with Gemini, and indexed in an in-browser vector store (HNSW).
- **Backend KB** — for larger orgs, the FastAPI backend uses Pinecone (index name configurable via `PINECONE_INDEX`).
- **Embedding cost guardrails** — embedding generation is gated and de-duplicated; the recent "embeddings money-leak fix" added per-tenant rate limiting.
- **Usage Meter** — sidebar shows current KB size with a 10 MB soft limit warning.

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

- **Anthropic** — Claude Sonnet / Opus / Haiku. Default for council validation.
- **Gemini** — generous free tier on Flash; default for embeddings.
- **Groq** — Llama 3.3 70B for ultra-fast, low-cost inference.
- **OpenRouter** — gateway to any model (Llama, DeepSeek, GPT, Claude, Gemini); attribution via `OPENROUTER_REFERER` and `OPENROUTER_TITLE`.
- **Custom** — any OpenAI-compatible endpoint (Ollama, vLLM, your own deployment).

The `ModelPicker` in the sidebar lets each user pick their preferred provider/model. The `model-catalog.ts` surface drives the dropdown.

### 8. Roles & RBAC

Backed by Supabase RLS and a `rbac/roles.py` permission matrix on the backend.

> [!WARNING]
> **In v1.0 this matrix is effectively dormant.** The permission checks are real and they run, but because auth is not wired (see [Security model](#security-model)), the extension self-assigns the `admin` role and the backend runs in `DEV_MODE`, treating every caller as a stub admin. The table below describes the intended model and what the code enforces once a real JWT is present, not what constrains a user today.

| Role | Capabilities |
|---|---|
| **Designer** | Upload/update Design System tokens, manage templates |
| **PMM** | Update Brand Voice, manage messaging framework, banned word list |
| **Sales Rep** | Generate pitches, use meeting copilot, access KB, push to CRM |
| **Admin** | Everything above + user management + KB wipe + RBAC editing |

Critical operations are permission-gated:
- `crm:connect` — minting Zoho OAuth tokens with full CRM scope. Restricted to `ADMIN`, `SALES_REP`. A viewer-role JWT cannot exchange the server's client_secret for an access_token.

### 9. Settings & Onboarding

- **Onboarding Checklist** — 3-step flow: add a model API key, connect one integration (optional), add at least one KB entry. Renders at the top of the panel while incomplete; once complete, collapses to a small "Set up" pill at the bottom so it stops eating real estate.
- **Quick Settings popover** — a sliders icon in the header opens a passcode-free popover with the reps' most-changed settings: LLM provider, model, deep-research toggle, sample-data toggle. The full Settings panel stays behind the admin passcode.
- **Sample data toggle** — one click loads 5 sample KB entries + 4 sample call records (prefix-tagged `demo_kb_*` / `demo_call_*`). Toggle off to remove them; real data is untouched. Useful for cold-start demoing without seeding real content.
- **Admin Gate** — full Settings panel is protected by an SHA-256-hashed passcode stored in `localStorage`. Set once from the Admin tab, then required for sensitive ops (KB wipe, role changes, integration disconnects, API key changes).
- **Integrations panel** — per-card config for Zoho CRM, Google Meet, Zoom (Meet/Zoom captured for parity; primary integration is Google Meet today).
- **Mock mode** — `VITE_MOCK_MODE=true` short-circuits all LLM calls to canned responses for offline UI development.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHROME EXTENSION (MV3)                          │
│                                                                         │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────────────┐   │
│  │   Sidebar    │   │ Background SW  │   │   Content Scripts        │   │
│  │  (React TS)  │◀──┤  Orchestrator  ├──▶│ ┌──────────────────────┐ │   │
│  │  + Zustand   │   │ Calendar poll  │   │ │  meet-transponder    │ │   │
│  └──────┬───────┘   └────────┬───────┘   │ │  page context        │ │   │
│         │                    │           │ └──────────────────────┘ │   │
│         │   ┌────────────────▼─────────┐ └──────────────────────────┘   │
│         │   │  Offscreen Document      │                                │
│         │   │  (tab audio → Deepgram)  │                                │
│         │   └──────────────────────────┘                                │
│         │                                                               │
│         │            shared Zustand store                               │
│         │   (session, transcript, suggestions, sentiment history,       │
│         │    agenda, KB index, generated assets)                        │
└─────────┼───────────────────────────────────────────────────────────────┘
          │ HTTPS  (JWT-authenticated)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI + Python 3.11)                   │
│                                                                         │
│  /api/v1/llm/*       → LLM proxy (Anthropic / Gemini / Groq / OpenRouter│
│  /api/v1/generate    → Multi-agent pitch generation pipeline            │
│  /api/v1/stt/*       → STT key handoff for Deepgram                     │
│  /api/v1/zoho/*      → Zoho OAuth exchange + refresh (RBAC-gated)       │
│  /api/v1/assets/*    → KB upload / vector indexing                      │
│  /api/v1/admin/*     → User management, role editing, KB wipe           │
│  /api/v1/auth/*      → Supabase JWT verification                        │
│                                                                         │
│  ┌────────────────────────────────────────────────────────┐             │
│  │              MULTI-AGENT ORCHESTRATOR                  │             │
│  │  Retrieval → ICP Personalization → Brand → Validation  │             │
│  └────────────────────────────────────────────────────────┘             │
└─────────────┬───────────────┬───────────────┬───────────────────────────┘
              ▼               ▼               ▼
       ┌──────────────┐  ┌──────────┐  ┌──────────────┐
       │   Pinecone   │  │ Supabase │  │   LLM        │
       │  Vector DB   │  │ Postgres │  │  Providers   │
       │  (KB index)  │  │  + Auth  │  │  (any)       │
       └──────────────┘  └──────────┘  └──────────────┘
```

---

## Project structure

```
project-wingman-sales-copilot/
├── extension/                          # Chrome Extension (React + TS + Vite)
│   ├── manifest.json                   # MV3 manifest
│   ├── vite.config.ts                  # Build + dev-only localhost injection
│   ├── tailwind.config.js              # Design tokens + brand colors
│   ├── .env.example                    # Template for VITE_* env vars
│   ├── src/
│   │   ├── background/                 # Service worker + orchestrator
│   │   ├── content/                    # Content scripts
│   │   │   ├── content-script.ts       # Generated-content insertion
│   │   │   └── meet-transponder.ts     # In-Meet overlay
│   │   ├── offscreen/                  # Offscreen doc for tab audio
│   │   │   └── audio-processor.js      # AudioWorklet
│   │   ├── popup/                      # Extension popup (minimal)
│   │   ├── sidebar/                    # Main UI
│   │   │   ├── components/             # All UI panels
│   │   │   ├── hooks/                  # useObjection, usePageContext, …
│   │   │   └── stores/                 # Zustand stores
│   │   ├── meeting-copilot/            # Live meeting feature
│   │   │   ├── agents/                 # live-orchestrator, post-call-summary
│   │   │   ├── stt/                    # Deepgram + mock
│   │   │   └── integrations/           # Google Calendar, Zoho CRM
│   │   └── shared/
│   │       ├── agents/                 # council, email-council, objection-council
│   │       ├── auth/                   # Google SSO + team config
│   │       ├── constants/              # ICP profiles
│   │       └── utils/                  # storage, KB indexer, vector store, …
│   └── icons/
│
├── backend/                            # FastAPI backend (Python 3.11)
│   ├── main.py                         # App entry + route mounting
│   ├── config.py                       # Env loading via pydantic-settings
│   ├── models.py                       # Pydantic request/response models
│   ├── requirements.txt
│   ├── agents/                         # Multi-agent pipeline
│   │   ├── orchestrator.py
│   │   ├── retrieval_agent.py
│   │   ├── icp_personalization_agent.py
│   │   ├── brand_compliance_agent.py
│   │   └── validation_agent.py
│   ├── rag/                            # Pinecone client + embedding helpers
│   ├── rbac/                           # roles.py — permission matrix
│   ├── api/
│   │   ├── routes/                     # generate, llm, stt, zoho, assets, admin, auth
│   │   └── middleware/                 # JWT auth middleware
│   ├── db/
│   │   ├── supabase_client.py
│   │   └── migrations/                 # 001_initial, 002_llm_usage
│   └── scripts/                        # test_openrouter, run_tests.sh
│
├── landing/                            # Static site, published to GitHub Pages
│   ├── index.html                      # Deployed from the gh-pages branch, not
│   ├── styles.css                      #   from Actions: see .github/workflows
│   ├── favicon.svg                     # The mark, generated
│   └── og.png                          # Social share card, generated
│
├── docs/
│   ├── ux/                             # UX audits + skin fidelity notes
│   └── launch/                         # Product Hunt launch material
│       ├── product-hunt-kit.md         # Tagline, description, first comment, replies
│       ├── demo-video-script.md        # 45-60s shot list
│       ├── screenshot-checklist.md     # The six shots + a verified setup recipe
│       ├── launch-checklist.md         # What is done vs what still needs a human
│       └── assets/                     # Thumbnail, social card, gallery cards
│
├── scripts/
│   ├── setup_env.sh                    # Interactive .env generator
│   ├── lint-manifest.sh                # Pre-release manifest lint (reads dist/)
│   ├── make_brand_assets.py            # Single source of truth for the identity:
│   │                                   #   icons, favicon, og card, thumbnail
│   └── make_gallery_cards.py           # Product Hunt gallery cards
│
├── .github/
│   ├── workflows/deploy-landing.yml    # Publishes landing/ to gh-pages
│   ├── ISSUE_TEMPLATE/                 # Bug + feature templates
│   └── pull_request_template.md
│
├── CONTRIBUTING.md
└── README.md
```

---

## Quick start

### Prerequisites

- Node.js 20+ and npm 10+
- **Python 3.11+, and this is a hard requirement, not a preference.** The backend uses PEP 604 unions (`str | None`) in function signatures without `from __future__ import annotations`, so it raises `TypeError` at import on 3.9. Stock macOS still ships 3.9, so check `python3 --version` first and install a newer one if needed (`brew install python@3.11`). Dependency resolution succeeds on 3.9, which makes this fail later and more confusingly than you would expect.
- A Supabase project (free tier is fine)
- API keys for at least one LLM provider (Gemini Flash has a generous free tier)
- Optional: Pinecone, Deepgram, Google OAuth Client ID, Zoho OAuth app

### 1. Clone & install

```bash
git clone https://github.com/avinashgaurav/project-wingman-sales-copilot.git
cd project-wingman-sales-copilot

# Extension
cd extension && npm install && cd ..

# Backend
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Generate `.env` files

```bash
bash scripts/setup_env.sh
```

This interactive script prompts for each value, hides secrets (no echo), and writes `backend/.env` and `extension/.env`. Press Enter to accept any defaults you don't want to override.

> [!NOTE]
> **You do not hand-edit `extension/manifest.json`.** The committed manifest is a template holding two deliberate placeholders: `oauth2.client_id` and a `your-backend.railway.app` host entry. `vite.config.ts` fills both in at build time from `VITE_GOOGLE_CLIENT_ID` and `VITE_BACKEND_URL`, writing the result to `extension/dist/manifest.json`.
>
> A **production** build (`npm run build`) fails loudly if the backend host is still unresolved, because MV3 blocks every request to a host that is not in `host_permissions`. A missing `VITE_GOOGLE_CLIENT_ID` only warns, since it is optional (see the config table).
>
> Three rules govern how `VITE_BACKEND_URL` becomes a host permission:
> - **Only `https` URLs qualify.** A `localhost` backend is covered by the dev-only localhost permissions instead.
> - **The port is stripped.** Chrome match patterns cannot contain one, so `https://api.example.com:8443` becomes `https://api.example.com/*`. A pattern with a port makes Chrome refuse to load the extension entirely.
> - **Loopback hosts are rejected in production even over `https`.** `https://localhost:8000` will not produce a host entry in a release build, which means the build fails rather than shipping page-level access to the developer's machine (the vulnerability class of issue #37).

### 3. Run the backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Backend will be at `http://localhost:8000`. Health check: `curl http://localhost:8000/health` (returns `{"status":"ok","service":"clientlens-backend"}`). Earlier versions of this README said `/healthz`, which 404s; the route defined in `main.py` is `/health`.

### 4. Build & load the extension

```bash
cd extension
npm run dev   # vite build --watch --mode development; injects localhost host_permissions
```

Then in Chrome:
1. Visit `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `extension/dist/`

The Project Wingman sidebar appears when you click the extension icon. **There is no sign-in step**: v1.0 provisions a local `admin` user and opens straight into the panel. See [Security model](#security-model) for what that means and why the backend must stay off the public internet.

### 5. Verify

```bash
# Build a production bundle (fails if manifest placeholders are unresolved)
cd extension && npm run build && cd ..

# Lint the BUILT manifest before any release
bash scripts/lint-manifest.sh
```

Order matters: the lint reads `extension/dist/manifest.json` when it exists, because the built manifest is what ships. Run it against a `npm run build` output, not a `npm run dev` output. The lint rejects a dev build as a release since dev builds intentionally grant `localhost` host permissions.

---

## Configuration

### `extension/.env` (Vite — public, baked into bundle)

| Variable | Purpose | Required |
|---|---|---|
| `VITE_BACKEND_URL` | FastAPI backend base URL | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key | Yes |
| `VITE_DEV_MODE` | Must be `true` in v1.0, and must match `DEV_MODE` in `backend/.env`. Sends a stub bearer instead of a Supabase JWT. Without it every backend call fails | Yes |
| `VITE_ALLOWED_DOMAIN` | Your company domain, used to infer the rep's own domain for team config. Does **not** gate sign-in | No |
| `VITE_GOOGLE_CLIENT_ID` | Chrome OAuth client ID, injected into the built manifest's `oauth2.client_id` at build time. Needed **only** for Google Slides/Docs/Drive export and Calendar sync | No |
| `VITE_LLM_PROVIDER` | Default provider (`gemini` / `groq` / `anthropic` / `openrouter` / `custom`) | Yes |
| `VITE_MOCK_MODE` | `true` to short-circuit LLM calls for UI dev | No |
| `VITE_GEMINI_MODEL` | Override default Gemini model | No |
| `VITE_OPENROUTER_MODEL` | Override default OpenRouter model | No |

### `backend/.env` (server-side — never bundled)

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key | Yes |
| `JWT_SECRET` | Secret for JWT signing/verification | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude key | If used |
| `GEMINI_API_KEY` | Google Gemini key | If used |
| `GROQ_API_KEY` | Groq key | If used |
| `OPENROUTER_API_KEY` | OpenRouter key | If used |
| `OPENROUTER_REFERER` | URL shown on openrouter.ai/activity | Optional |
| `OPENROUTER_TITLE` | App attribution title | Optional |
| `PINECONE_API_KEY` | Pinecone key | If using Pinecone |
| `PINECONE_INDEX` | Index name (defaults to `clientlens`) | If using Pinecone |
| `DEEPGRAM_API_KEY` | Deepgram STT key | If using live mode |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Currently unused.** Defined in `config.py` but read by no backend code. Google auth is entirely client-side via `chrome.identity.getAuthToken`, which reads the manifest's `oauth2.client_id` (set `VITE_GOOGLE_CLIENT_ID` instead). Reserved for a future server-side flow | No |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | Zoho OAuth | If using CRM push |
| `DEV_MODE` | Must be `true` in v1.0. `AuthMiddleware` then accepts every request as a stub admin. Required because no code path creates a Supabase session. Keep such a backend off the public internet | Yes |
| `BACKEND_URL` | Self URL (used in OAuth callbacks) | Yes |
| `ALLOWED_ORIGINS` | CORS allowlist (extension + dev origins) | Yes |
| `DAILY_USER_TOKEN_BUDGET` | Per-user daily LLM token cap (default `1000000`) | Optional |
| `MAX_EMBED_TEXT_BYTES` | Per-text byte cap on `/embed` inputs (default `51200`) | Optional |
| `ASSETS_MAX_UPLOAD_BYTES` | Per-upload byte cap on `/assets/upload` (default `26214400` = 25 MB) | Optional |

### Tuning the LLM token budget

`DAILY_USER_TOKEN_BUDGET` (default 1M tokens / user / UTC day) is a soft ceiling enforced before each `/complete`, `/stream`, and `/embed` call. The check reads cumulative usage from the `llm_usage` table and returns `429 Retry-After: 3600` if the call would exceed the cap.

When to raise it:

- **Heavy KB indexers.** A single max-batch `/embed` call (100 texts × 50 KB each, the per-text cap) projects ~1.25M tokens. If you re-index a large KB regularly, set the budget to **5M+ tokens per user** or split indexing across days.
- **Long pitch decks.** A four-agent council pass can run 8K–20K tokens per pitch. 1M tokens fits ~50–125 pitches per day per rep. If your reps generate more than that, raise the budget.

When to lower it:

- **Untrusted users / multi-tenant.** Drop to **100K–250K** to keep costs bounded if a viewer-role user finds a way to call the proxy.

The check is **fail-open**: if the Supabase query for today's usage errors, calls go through (logged as `token_budget.query_failed`). A Supabase outage shouldn't wedge your reps mid-call.

### First-time tabCapture permission grant

`tabCapture` is declared under `optional_permissions` in `manifest.json`, so the scary "Record content of your screen" warning does not appear at install time. Chrome prompts for it the first time the rep clicks **Start Live Mode**.

**Edge case:** Live Mode can also auto-start when joining a Meet call if the rep has previously enabled "Don't ask again". On a brand-new install, that auto-start fires before the user has clicked anything — Chrome will not grant the permission without a user-gesture. The auto-start will silently bail; the next manual click on **Start Live Mode** prompts and grants normally. Once granted, all future auto-starts work.

If you want auto-start to "just work" from install, have new reps click the Live Mode toggle once after install to grant the permission proactively.

---

## Development guide

### A note on the name `clientlens`

The project's original working name was **ClientLens**, and that string is still load-bearing in a few places, so you will see it while reading the source:

- `chrome.storage.local` key prefixes (call history, KB vector store, telemetry, admin gate)
- the feature flag `clientlens_objection_composer_v2`
- the default Pinecone index name (`PINECONE_INDEX` defaults to `clientlens`)
- transponder DOM element IDs

It is deliberately **not** renamed. Those storage keys and the index name are persistence identifiers: renaming them would orphan every existing user's call history, KB index, and admin passcode without a migration. If you fork this and want a clean namespace, do the rename and ship a one-time migration that copies the old keys forward before deleting them.

### Mock mode

Set `VITE_MOCK_MODE=true` to develop the UI without burning LLM credits. All agent calls return canned responses; the meeting copilot uses `mock-stt.ts` instead of streaming to Deepgram.

Note: in this codebase mock mode still routes through the FastAPI backend's `/api/v1/llm/complete` endpoint (the backend has its own mock branch). Pure offline UI dev with no backend running is not yet supported.

### Regenerating brand assets

Every visual identity asset comes from one script, so the toolbar icon, the site favicon, the nav and footer marks, the share card and the Product Hunt thumbnail cannot drift apart:

```bash
python3 scripts/make_brand_assets.py     # icons, icon.svg, favicon.svg, og.png, thumbnail, social card
python3 scripts/make_gallery_cards.py    # Product Hunt gallery cards
```

Requires Pillow. Small icon sizes are not scaled from one master: the glow tightens and the chevron thickens as the canvas shrinks, because a 16px icon inheriting the 128px blur loses its silhouette. Edit `TUNING` in the script if you change the mark.

The popup and sidebar render `icons/icon128.png` directly rather than re-typing a text mark, which is how the product previously ended up showing three different identities at once.

### Type checking

```bash
cd extension && npm run type-check    # tsc --noEmit
```

### Linting

```bash
cd extension && npm run lint           # ESLint v9 over src/**/*.{ts,tsx}
bash scripts/lint-manifest.sh          # Manifest placeholder + permission lint
```

### Testing

Backend test scripts live in `backend/scripts/`:

```bash
bash backend/scripts/run_tests.sh           # All tests
python3 backend/scripts/test_openrouter.py  # OpenRouter integration sanity check
```

### Building for release

```bash
cd extension && npm run build               # vite build --mode production
bash scripts/lint-manifest.sh               # Fails if YOUR_*, your-backend.railway.app, or <all_urls> remain
```

The lint script blocks shipping placeholder strings or `<all_urls>` permissions to the Chrome Web Store.

---

## Security model

The product handles OAuth tokens, transcripts, and an org-wide KB — security posture matters.

- **No LLM keys in the browser.** All provider keys live in `backend/.env`. The extension calls `/api/v1/llm/*`; the backend proxies. Switching providers is a backend config change, not an extension release.
- **No `<all_urls>`.** `content_scripts` inject into exactly three origins: `docs.google.com`, `www.notion.so`, and `meet.google.com`. `lint-manifest.sh` enforces the absence of `<all_urls>` in both the template and the built manifest.
- **`host_permissions` are enumerated, not wildcarded**, but the list is wider than the content-script list because the extension calls these hosts directly. Current groups, and why each is there:
  - **Product surfaces the content scripts run on:** `docs.google.com`, `slides.google.com`, `www.notion.so`, `meet.google.com`.
  - **Page-context capture:** `www.linkedin.com` (reads the profile or company page you are pitching into).
  - **Your own infrastructure:** `*.supabase.co`, plus the backend host injected at build time from `VITE_BACKEND_URL`.
  - **Services the extension talks to directly:** `api.deepgram.com` and `wss://api.deepgram.com` (live STT), `www.googleapis.com` (Slides, Drive, Calendar), the Zoho API and accounts hosts per data centre.
  - **Company-logo lookup, purely cosmetic:** `logo.clearbit.com`, `www.google.com` (the `/s2/favicons` endpoint), `icons.duckduckgo.com`. Tried in that order by `shared/utils/brand-assets.ts`. These are the loosest entries and the ones a Chrome Web Store reviewer is most likely to question. Removing them from `manifest.json` degrades gracefully: `fetchBrandAssets` returns `logo_source: "placeholder"` with no logo and a deterministic brand colour derived from the company name, and manual logo upload still works.
- **Dev-only localhost** — `http://localhost:8000` and `http://localhost:11434` host_permissions are **injected only when `vite build --mode development`** runs. A production build never grants page access to localhost.
- **FETCH_URL_TEXT hardened** — the background service worker's URL-fetch message handler rejects content-script senders and external extensions, blocking SSRF chains where a visited page could drive the extension to fetch arbitrary URLs (including private localhost) and read back the response.
- **CRM RBAC** — Zoho `/exchange` and `/refresh` endpoints require the `crm:connect` permission (`ADMIN`, `SALES_REP` only). A viewer-role JWT cannot mint a Zoho access token using the server's `client_secret`.
- **Data centre allowlist** — Zoho upstream URL is constructed from a vetted set (`{com, eu, in, com.cn, com.au, jp}`), preventing a caller from steering token exchange to `accounts.zoho.<attacker>`.
- **Authentication is not wired in v1.0, and this is the most important thing on this page.** Be clear-eyed about it before you deploy:
  - The sidebar **provisions a local user with the `admin` role** on first render (`sidebar/App.tsx`). There is no sign-in step.
  - `signInWithGoogle()` exists in `shared/auth/google-sso.ts` but **is called from nowhere**. Nothing in the extension creates a Supabase session.
  - Consequently `backendJwt()` cannot obtain a JWT, so the backend must run with `DEV_MODE=true`, in which `AuthMiddleware` accepts every request as a stub user and logs `auth.dev_mode_bypass` each time. With `DEV_MODE=false` the product cannot make a single backend call.
  - The stub user's role is **`sales_rep`, deliberately not `admin`** (`api/middleware/auth.py`). So the `/admin/*` endpoints stay gated by the RBAC matrix even in dev mode: KB wipe and role edits are not reachable through the bypass. That is a real limit, not a cosmetic one.
  - **Therefore: bind the backend to localhost or keep it behind your own network boundary. Do not deploy it to a public URL in this configuration.** Anyone who reaches it can spend your LLM budget and read your knowledge base with rep-level access. `DAILY_USER_TOKEN_BUDGET` bounds the damage; it does not prevent it.
  - `VITE_ALLOWED_DOMAIN` does **not** gate anything. It is read by `bg-orchestrator.ts` and `shared/auth/team-config.ts` only, to infer the rep's own company domain. An earlier version of this README claimed it restricted sign-in. It never did.
  - This is a fine posture for the single-user, self-hosted, local-backend case that v1.0 targets. It is **not** safe for a shared team deployment. Wiring real auth is the top item on the [roadmap](#roadmap).
- **Admin passcode** — Settings panel is gated by an SHA-256-hashed passcode. Sensitive ops (KB wipe, role edit, integration disconnect) require it.
- **Audio handling** — tab audio is streamed to Deepgram via WebSocket and never persisted server-side beyond the live transcript buffer.
- **Repository protection** — `main` is protected: no force-pushes, no deletion, linear history required (squash/rebase merges only). Admin enforcement is off so the maintainer can emergency-fix; required-PR-reviews is off because this is a solo-maintained repo.

---

## Tech stack

| Layer | Technology |
|---|---|
| Extension UI | React 18, TypeScript 5, Tailwind CSS 3, Zustand |
| Extension runtime | Chrome Manifest V3, Service Worker, Offscreen API, AudioWorklet |
| Build | Vite 8 (rolldown), `@vitejs/plugin-react` 6 |
| Backend framework | FastAPI, Pydantic v2 (Python 3.11) |
| LLM providers | Anthropic Claude, Google Gemini, Groq (Llama 3.3 70B), OpenRouter (any model), any OpenAI-compatible endpoint |
| Embeddings | Gemini `text-embedding-004` |
| RAG / Vector store | Pinecone (server-side) or in-browser HNSW vector store (client-side) |
| Database | Supabase Postgres + Row-Level Security |
| Auth | Supabase JWT, Google OAuth, Zoho OAuth |
| Speech-to-Text | Deepgram Nova-2 (real-time streaming) |
| Document generation | Google Slides API, Google Drive API |
| Observability | structlog (backend) |
| Deployment | **v1.0: run the backend locally** (`uvicorn` on localhost). Railway / Render / Fly.io are supported targets in the code, but a public deployment is unsafe until auth is wired, because `DEV_MODE` accepts every request as an admin. Extension: unpacked load; no Chrome Web Store listing yet |

---

## Roadmap

- ~~Email council UI surface~~ — **shipped**: the Email mode (Generate tab) drives the council pipeline and renders a copy-ready draft
- ~~One-shot "what do I say" objection composer~~ — **shipped**: inline `[N]` citation chips, `▾ Why this answer` disclosure, feature-flag gated, telemetry wired (#117 / #118 / #119)
- **Wire real authentication (top priority).** Call `signInWithGoogle()` on first run instead of provisioning a local admin, exchange the Google identity for a Supabase session so `backendJwt()` stops needing the `DEV_MODE` bypass, and make the `rbac/roles.py` matrix actually constrain callers. Until this lands, a shared team deployment is not safe and the backend must stay off the public internet.
- **Error boundary around the side panel** ([#129](https://github.com/avinashgaurav/project-wingman-sales-copilot/issues/129)). A single render error currently unmounts the whole panel to a blank surface, which is indistinguishable from a broken install. Worth closing before any Web Store listing
- Streamed objection response (`respondAgent` over `callStream`; needs an agent-contract refactor for the JSON trailer — non-trivial)
- Move Objection out of the Generate-tab mode switcher (it's a mid-call workflow, not a Generate sub-mode) + keyboard shortcut for selected-text capture
- Auto-end Live Meeting Copilot session when the Meet tab closes (saves the "rep forgot to click End" footgun)
- Salesforce + HubSpot CRM connectors (parity with Zoho)
- Microsoft Teams meeting copilot
- On-device STT option (Whisper / faster-whisper) for privacy-sensitive deployments
- Multi-tenant SaaS mode with org-level KB isolation
- Slack integration for post-call summary delivery
- Browser-side fine-tuning of the council validator on each org's historical wins/losses

The backlog with concrete acceptance criteria lives in [#113 — workflow + UX audit backlog](https://github.com/avinashgaurav/project-wingman-sales-copilot/issues/113). Pick anything in any order; the items are largely independent.

---

## Contributing

PRs welcome, including small ones. [**`CONTRIBUTING.md`**](CONTRIBUTING.md) has the full guide: local setup, the two things that trip everyone up, what to put in a PR, and an honest list of what I will probably say no to.

The short version. Before opening a PR:

```bash
cd extension
npm run type-check      # tsc --noEmit
npm run lint            # eslint src
npm run build           # fails on unresolved manifest placeholders
cd .. && bash scripts/lint-manifest.sh
```

There is no CI on this repo yet, so those four are on you.

**Where to start:** [#113](https://github.com/avinashgaurav/project-wingman-sales-copilot/issues/113) is the workflow and UX backlog with acceptance criteria, and the items are largely independent. Setup failures are real bugs and among the most useful reports, since the self-hosted path gets exercised on far fewer machines than it should.

Bug reports and feature requests go through the issue templates. Questions that are not bugs belong in [Discussions](https://github.com/avinashgaurav/project-wingman-sales-copilot/discussions). **Security issues: do not open a public issue**, use a [private advisory](https://github.com/avinashgaurav/project-wingman-sales-copilot/security/advisories/new) instead. This project handles OAuth tokens, call transcripts and an org-wide knowledge base.

---

## License

[MIT](LICENSE) © 2026 Avinash Gaurav.

Free to use, modify, and distribute. The bring-your-own-keys model means you run it on your own LLM provider accounts — there's no Wingman-hosted service and no telemetry. See [`LICENSE`](LICENSE) for the full text.

# Architecture and project structure

How the pieces fit together, and where everything lives on disk.

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

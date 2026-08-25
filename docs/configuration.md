# Configuration

Every environment variable, plus the tuning knobs worth knowing about. Generate both `.env` files with `bash scripts/setup_env.sh` rather than writing them by hand.

## Configuration

### `extension/.env` (Vite: public, baked into bundle)

| Variable | Purpose | Required |
|---|---|---|
| `VITE_BACKEND_URL` | FastAPI backend base URL. `http://localhost:8000` for the normal v1.0 self-hosted setup, which requires the dev build (`npm run dev`). A **release** build (`npm run build`) requires a public **https** URL and rejects loopback hosts: see [the two build modes](development.md#the-two-build-modes-and-which-one-you-want) | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key | Yes |
| `VITE_DEV_MODE` | Must be `true` in v1.0, and must match `DEV_MODE` in `backend/.env`. Sends a stub bearer instead of a Supabase JWT. Without it every backend call fails | Yes |
| `VITE_ALLOWED_DOMAIN` | Your company domain, used to infer the rep's own domain for team config. Does **not** gate sign-in | No |
| `VITE_GOOGLE_CLIENT_ID` | Chrome OAuth client ID, injected into the built manifest's `oauth2.client_id` at build time. Needed **only** for Google Slides/Docs/Drive export and Calendar sync | No |
| `VITE_LLM_PROVIDER` | Default provider (`gemini` / `groq` / `anthropic` / `openrouter` / `custom`) | Yes |
| `VITE_MOCK_MODE` | `true` to short-circuit LLM calls for UI dev | No |
| `VITE_GEMINI_MODEL` | Override default Gemini model | No |
| `VITE_OPENROUTER_MODEL` | Override default OpenRouter model | No |

### `backend/.env` (server-side, never bundled)

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key | Yes |
| `JWT_SECRET` | Secret for JWT signing/verification | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude key | If used |
| `GEMINI_API_KEY` | Google Gemini key. On a key created today only `gemini-3.6-flash` works; the 1.5, 2.0 and 2.5 families return `404 no longer available to new users` and are absent from the API's model list | If used |
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

**Edge case:** Live Mode can also auto-start when joining a Meet call if the rep has previously enabled "Don't ask again". On a brand-new install, that auto-start fires before the user has clicked anything, Chrome will not grant the permission without a user-gesture. The auto-start will silently bail; the next manual click on **Start Live Mode** prompts and grants normally. Once granted, all future auto-starts work.

If you want auto-start to "just work" from install, have new reps click the Live Mode toggle once after install to grant the permission proactively.

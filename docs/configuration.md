# Configuration

Every environment variable, plus the tuning knobs worth knowing about. Generate both `.env` files with `bash scripts/setup_env.sh` rather than writing them by hand.

## Configuration

### `extension/.env` (Vite: public, baked into bundle)

| Variable | Purpose | Required |
|---|---|---|
| `VITE_BACKEND_URL` | FastAPI backend base URL. `http://localhost:8000` for the normal v1.0 self-hosted setup, which requires the dev build (`npm run dev`). A **release** build (`npm run build`) requires a public **https** URL and rejects loopback hosts: see [the two build modes](development.md#the-two-build-modes-and-which-one-you-want) | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key | Yes |
| `VITE_DEV_MODE` | Local development only: skips sign-in and sends a stub bearer. Must match `DEV_MODE` in `backend/.env`. Leave unset for a real build | No |
| `VITE_EXTENSION_KEY` | Public key that pins the unpacked extension's ID, so the Google OAuth client and `ALLOWED_ORIGINS` can name it | For a deployed backend |
| `VITE_ALLOWED_DOMAIN` | Your company domain, used to infer the rep's own domain for team config. Does **not** gate sign-in | No |
| `VITE_GOOGLE_CLIENT_ID` | Chrome OAuth client ID, injected into the built manifest's `oauth2.client_id` at build time. Needed **only** for Google Slides/Docs/Drive export and Calendar sync | No |
| `VITE_LLM_PROVIDER` | Default provider for new installs (`gemini` / `groq` / `anthropic` / `openrouter` / `custom`). For the first four the key stays on the backend | Yes |
| `VITE_MOCK_MODE` | `true` to short-circuit LLM calls for UI dev | No |
| `VITE_GEMINI_MODEL` | Override default Gemini model | No |
| `VITE_OPENROUTER_MODEL` | Override default OpenRouter model | No |

### `backend/.env` (server-side, never bundled)

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY` also accepted) | Yes |
| `JWT_ALGORITHMS` | Accepted access-token algorithms (default `ES256,RS256`, verified against the project's JWKS). Add `HS256` only for a project still on the legacy shared secret | No |
| `JWT_SECRET` | The project's legacy JWT secret (`SUPABASE_JWT_SECRET` also accepted). Used only when `JWT_ALGORITHMS` includes `HS256`, and then it must be the real secret (32+ characters) | Only with HS256 |
| `GLOBAL_DAILY_TOKEN_BUDGET` | LLM tokens per UTC day across all users (default 20,000,000) | No |
| `ALLOWED_MODELS_ANTHROPIC` / `_GROQ` / `_OPENROUTER` | Comma-separated models callers may use on the server's keys (defaults: the models the extension offers; Gemini has its own list in `llm.py`) | No |
| `GEMINI_FALLBACK_MODELS` | Models tried in order when the requested Gemini model's daily allowance is spent or it is retired for the key (default `gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest`). On a free-tier key each model has its own small daily allowance | No |
| `GEMINI_THINKING_LEVEL` | Thinking level for current Gemini models (default `minimal`, so short answers aren't spent on thinking) | No |
| `MAX_INFLIGHT_PER_USER` | LLM calls one user may have running at once, per instance (default 3) | No |
| `ASSETS_MAX_PER_USER` / `ASSETS_MAX_BYTES_PER_USER` | Upload quota per user (default 200 files, 100 MB) | No |
| `ANTHROPIC_API_KEY` | Anthropic Claude key | If used |
| `GEMINI_API_KEY` | Google Gemini key. On a key created today only `gemini-3.6-flash` works; the 1.5, 2.0 and 2.5 families return `404 no longer available to new users` and are absent from the API's model list | If used |
| `GROQ_API_KEY` | Groq key | If used |
| `OPENROUTER_API_KEY` | OpenRouter key | If used |
| `OPENROUTER_REFERER` | URL shown on openrouter.ai/activity | Optional |
| `OPENROUTER_TITLE` | App attribution title | Optional |
| `DEEPGRAM_API_KEY` | Deepgram STT key | If using live mode |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Currently unused.** Defined in `config.py` but read by no backend code. Google auth is entirely client-side via `chrome.identity.getAuthToken`, which reads the manifest's `oauth2.client_id` (set `VITE_GOOGLE_CLIENT_ID` instead). Reserved for a future server-side flow | No |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | Zoho OAuth | If using CRM push |
| `DEV_MODE` | Local development only: `AuthMiddleware` accepts every request as a stub `sales_rep` user and the daily caps are skipped. Never set it on a deployed backend | No |
| `DAILY_USER_STT_SESSIONS` | Live transcription sessions per user per UTC day (default 30) | No |
| `BACKEND_URL` | Self URL (used in OAuth callbacks) | Yes |
| `ALLOWED_ORIGINS` | CORS allowlist (extension + dev origins) | Yes |
| `DAILY_USER_TOKEN_BUDGET` | Per-user daily LLM token cap (default `1000000`) | Optional |
| `MAX_EMBED_TEXT_BYTES` | Per-text byte cap on `/embed` inputs (default `51200`) | Optional |
| `ASSETS_MAX_UPLOAD_BYTES` | Per-upload byte cap on `/assets/upload` (default `26214400` = 25 MB) | Optional |

### Tuning the LLM token budget

`DAILY_USER_TOKEN_BUDGET` (default 1M tokens / user / UTC day) is enforced before each `/complete`, `/stream`, and `/embed` call. Each call first reserves its estimated tokens under a database lock (migration 007), so parallel calls can't all slip under the cap, and a call that ends early stays charged at its estimate. Over the cap returns `429 Retry-After: 3600`.

When to raise it:

- **Heavy KB indexers.** A single max-batch `/embed` call (100 texts × 50 KB each, the per-text cap) projects ~1.25M tokens. If you re-index a large KB regularly, set the budget to **5M+ tokens per user** or split indexing across days.
- **Long pitch decks.** A four-agent council pass can run 8K–20K tokens per pitch. 1M tokens fits ~50–125 pitches per day per rep. If your reps generate more than that, raise the budget.

When to lower it:

- **Untrusted users / multi-tenant.** Drop to **100K–250K** to keep costs bounded if a viewer-role user finds a way to call the proxy.

The check is **fail-closed**: if the reservation can't be made, the call is refused with 503 (logged as `token_budget.reserve_failed`). With open sign-up, an unreadable budget must not become unlimited usage.

### First-time tabCapture permission grant

`tabCapture` is declared under `optional_permissions` in `manifest.json`, so the scary "Record content of your screen" warning does not appear at install time. Chrome prompts for it the first time the rep clicks **Start Live Mode**.

**Edge case:** Live Mode can also auto-start when joining a Meet call if the rep has previously enabled "Don't ask again". On a brand-new install, that auto-start fires before the user has clicked anything, Chrome will not grant the permission without a user-gesture. The auto-start will silently bail; the next manual click on **Start Live Mode** prompts and grants normally. Once granted, all future auto-starts work.

If you want auto-start to "just work" from install, have new reps click the Live Mode toggle once after install to grant the permission proactively.

### Gemini models on a new key

> [!IMPORTANT]
> **On a new Gemini key, use `gemini-3.6-flash`.** Google has restricted the 1.5, 2.0 and 2.5 families to accounts that had already used them, so a key created today returns `404 no longer available to new users` on those, and they do not appear in the API's own model list either. `gemini-3.6-flash` works and is the default here. Groq and OpenRouter are the alternatives if you would rather not use Google at all.

### The manifest template and the dev build

> [!NOTE]
> **You never hand-edit `extension/manifest.json`.** It is a template with two deliberate placeholders. The build injects your OAuth client ID and backend host from `.env` into `extension/dist/manifest.json`. A production build fails if the backend host is unresolved, and warns if the client ID is missing (that one is optional: only Google Slides/Drive export and Calendar sync read it).
>
> **Use `npm run dev`, not `npm run build`.** Self-hosting v1.0 against a local backend is the supported shape, and only the dev build may reach `localhost`. A release build requires a public https backend, which is not safe to expose until authentication is wired. [The two build modes](development.md#the-two-build-modes-and-which-one-you-want) explains why.

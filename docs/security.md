# Security model

Read this before you deploy anything. The most important section is the first one.

## Security model

The product handles OAuth tokens, transcripts, and an org-wide KB, security posture matters.

- **Hosted-provider keys stay on the backend.** Anthropic, Gemini, Groq and OpenRouter keys live in `backend/.env`; the extension calls `/api/v1/llm/*` and the backend proxies. The exception is a custom OpenAI-compatible endpoint or Ollama: those are called directly from the extension, so their key is stored in the extension's settings (and a `VITE_GROQ_PRESET_KEY` set at build time is baked into the bundle as the custom provider's default key). Leave that variable blank for any build you share.
- **No `<all_urls>`.** `content_scripts` inject into exactly one origin: `meet.google.com`. `lint-manifest.sh` enforces the absence of `<all_urls>` in both the template and the built manifest.
- **`host_permissions` are enumerated, not wildcarded**, but the list is wider than the content-script list because the extension calls these hosts directly. Current groups, and why each is there:
  - **Product surfaces the extension reads or writes:** `docs.google.com`, `slides.google.com`, `www.notion.so`, `meet.google.com`.
  - **Page-context capture:** `www.linkedin.com` (reads the profile or company page you are pitching into).
  - **Your own infrastructure:** `*.supabase.co`, plus the backend host injected at build time from `VITE_BACKEND_URL`.
  - **Services the extension talks to directly:** `api.deepgram.com` and `wss://api.deepgram.com` (live STT), `www.googleapis.com` (Slides, Drive, Calendar), the Zoho API and accounts hosts per data centre.
  - **Company-logo lookup, purely cosmetic:** `logo.clearbit.com`, `www.google.com` (the `/s2/favicons` endpoint), `icons.duckduckgo.com`. Tried in that order by `shared/utils/brand-assets.ts`. These are the loosest entries and the ones a Chrome Web Store reviewer is most likely to question. Removing them from `manifest.json` degrades gracefully: `fetchBrandAssets` returns `logo_source: "placeholder"` with no logo and a deterministic brand colour derived from the company name, and manual logo upload still works.
- **Dev-only localhost**: `http://localhost:8000` and `http://localhost:11434` host_permissions are **injected only when `vite build --mode development`** runs. A production build never grants page access to localhost.
- **FETCH_URL_TEXT hardened**: the background service worker's URL-fetch message handler rejects content-script senders and external extensions, blocking SSRF chains where a visited page could drive the extension to fetch arbitrary URLs (including private localhost) and read back the response.
- **CRM RBAC**: Zoho `/exchange` and `/refresh` endpoints require the `crm:connect` permission (`ADMIN`, `OWNER`, `SALES_REP`), and each user gets 20 exchanges an hour. A viewer-role JWT cannot mint a Zoho access token using the server's `client_secret`, and upstream error bodies are not echoed back.
- **Data centre allowlist**: Zoho upstream URL is constructed from a vetted set (`{com, eu, in, com.cn, com.au, jp}`), preventing a caller from steering token exchange to `accounts.zoho.<attacker>`.
- **Authentication: email and password through Supabase Auth, open sign-up.**
  - The side panel opens on a sign-in screen (`sidebar/components/SignIn.tsx`); anyone can create an account. `backendJwt()` sends the Supabase access token on every backend call.
  - The backend verifies each token locally (`db/supabase_client.py`): HS256 with the project's JWT secret, or ES256/RS256 against the project's published JWKS. Audience must be `authenticated`, so the anon and service keys are refused. The caller's profile is cached for 60 seconds.
  - **Every account is its own workspace.** Sign-ups get the `owner` role: full control of their own assets, brand voice and design system, and no user management (that stays `admin`). The routes filter by owner and RLS allows reading only your own rows (migration 005).
  - **Daily caps, fail closed:** `DAILY_USER_TOKEN_BUDGET` (LLM tokens, default 1,000,000) and `DAILY_USER_STT_SESSIONS` (live transcription sessions, default 30). If the usage check can't run, the call is refused with 503 rather than let through.
  - `DEV_MODE=true` still exists for local development only: it accepts a stub user and skips the caps. Never set it on a deployed backend.
  - `VITE_ALLOWED_DOMAIN` does **not** gate anything; it only infers the rep's own company domain.
- **Admin passcode**: Settings panel is gated by an SHA-256-hashed passcode. Sensitive ops (KB wipe, role edit, integration disconnect) require it.
- **Audio handling**: tab audio is streamed to Deepgram via WebSocket and never persisted server-side beyond the live transcript buffer.
- **Repository protection**: `main` is protected: no force-pushes, no deletion, linear history required (squash/rebase merges only). Admin enforcement is off so the maintainer can emergency-fix; required-PR-reviews is off because this is a solo-maintained repo.
- **Privacy**: you can use the hosted backend, where your account, knowledge base and AI calls go through that backend, or self-host it and run it on your own provider accounts. Either way there is no telemetry. The `track()` helper in `shared/utils/telemetry.ts` only logs to the console and keeps a 100-event buffer in `chrome.storage.local`; nothing is sent anywhere. Separately, the landing page (clientlens-ai.vercel.app) counts anonymous page views with Vercel Analytics; that is the website, not the extension.

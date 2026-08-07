# Security model

Read this before you deploy anything. The most important section is the first one.

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
  - This is a fine posture for the single-user, self-hosted, local-backend case that v1.0 targets. It is **not** safe for a shared team deployment. Wiring real auth is the top item on the [roadmap](../README.md#roadmap).
- **Admin passcode** — Settings panel is gated by an SHA-256-hashed passcode. Sensitive ops (KB wipe, role edit, integration disconnect) require it.
- **Audio handling** — tab audio is streamed to Deepgram via WebSocket and never persisted server-side beyond the live transcript buffer.
- **Repository protection** — `main` is protected: no force-pushes, no deletion, linear history required (squash/rebase merges only). Admin enforcement is off so the maintainer can emergency-fix; required-PR-reviews is off because this is a solo-maintained repo.

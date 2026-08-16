# Contributing to Project Wingman

Thanks for looking. This is a solo-maintained MIT project, and the whole point of putting it in the open is that other people try it, use it, and improve it. Issues and pull requests are genuinely welcome, including small ones.

## The fastest useful contribution

You do not need to write code to help. In rough order of value:

1. **Run it and tell me where it broke.** The setup path (self-hosted backend, your own keys) is the least-tested part of this project because it mostly gets exercised on one machine. If step 3 of the Quick Start fails on your setup, that is a real bug and I want the issue.
2. **Tell me what a rep would actually want.** Sales workflow feedback beats code. If the live-mode coaching cues fire at the wrong moment, say so.
3. **Pick something off the backlog.** [Issue #113](https://github.com/avinashgaurav/project-wingman/issues/113) is the workflow and UX audit backlog, with acceptance criteria. Items are largely independent, so pick any of them in any order.

## Local setup

Prerequisites: Node 20+, npm 10+, Python 3.11+, a Supabase project (free tier is fine), and at least one LLM provider key. Gemini Flash has a generous free tier.

```bash
git clone https://github.com/avinashgaurav/project-wingman.git
cd project-wingman

bash scripts/setup_env.sh          # writes backend/.env and extension/.env

cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

cd ../extension && npm install && npm run dev
```

Then load `extension/dist/` at `chrome://extensions` with Developer mode on.

Two things that trip people up:

- **Do not hand-edit `extension/manifest.json`.** It is a template. `vite.config.ts` injects `oauth2.client_id` from `VITE_GOOGLE_CLIENT_ID` and your backend host from `VITE_BACKEND_URL` at build time. If Google sign-in fails, check `extension/dist/manifest.json` for a real client ID first.
- **`npm run dev` is not a release build.** It injects `localhost` host permissions on purpose. Use `npm run build` for anything you would actually ship.

You can develop most of the UI without burning LLM credits by setting `VITE_MOCK_MODE=true`. Note the caveat in the README: mock mode still routes through the backend's own mock branch, so the backend needs to be running.

## Before you open a PR

Run all four. CI is not going to catch it for you, because there is no CI on this repo yet.

```bash
cd extension
npm run type-check      # tsc --noEmit
npm run lint            # eslint src
npm run build           # production bundle; fails on unresolved manifest placeholders
cd .. && bash scripts/lint-manifest.sh
```

For backend changes:

```bash
bash backend/scripts/run_tests.sh
```

## Pull request expectations

- **One concern per PR.** A 40-file PR that mixes a bug fix with a refactor will sit unreviewed longer than three small ones.
- **Say what you tested manually.** Much of this codebase is Chrome extension surface area that no test harness covers: side panel, offscreen audio capture, content scripts, the Meet transponder. "I ran a real Meet call and the transponder rendered" is more useful than a green type-check.
- **Squash-friendly history.** `main` requires linear history, so PRs land as squash or rebase merges. Do not worry about a messy branch history.
- **Touching `chrome.storage` keys?** Say so explicitly in the PR body. Those keys are persistence identifiers (see the note on the `clientlens` prefix in the README), and changing one without a migration silently orphans user data.
- **Touching `manifest.json` permissions?** Explain why the new permission is needed. Chrome Web Store review is stricter than this repo is, and every added host is a question to answer later.

## Security issues

Do not open a public issue for a vulnerability. This project handles OAuth tokens, call transcripts, and an org-wide knowledge base. Email the maintainer or open a [private security advisory](https://github.com/avinashgaurav/project-wingman/security/advisories/new) instead.

## What I will probably say no to

Not to be discouraging, just to save you the work:

- **A hosted SaaS mode with a Wingman-run server.** The bring-your-own-keys, no-Wingman-server property is the point of the project, not a limitation of it. Multi-tenant self-hosted mode is on the roadmap; a Wingman-operated cloud is not.
- **Sending transcripts anywhere they are not already sent.** Audio goes to your configured STT provider and text to your configured LLM. Any PR that widens that gets a hard look.
- **Adding a build-time dependency to do something small.** The extension bundle is already the slowest part of the rep's experience.

## License

By contributing you agree your contribution is MIT licensed, matching the rest of the project.

# Screenshot checklist

The project currently ships **zero** real product screenshots. The only PNGs in the repo are the five skin-audit shots in `docs/ux/skin-audit/`, and every product visual on the landing page is a hand-built CSS mockup. That is the biggest remaining credibility gap for the launch: a tool that claims to coach you live has to show itself working.

Like the demo video, only you can capture these, since they need a configured extension against a real backend.

## Getting to a screenshot-ready state

Verified end to end on a clean clone with Python 3.11. **You do not need a real Supabase project just to capture screenshots**, and you do not need a Google OAuth client ID at all.

`supabase-py` only checks that the service key *looks* like a JWT (it must start with `ey`), so a placeholder gets you a booting backend. Real Supabase calls will fail at runtime, but the token-budget check is fail-open and mock mode short-circuits the LLM calls, so the UI renders.

`backend/.env`:

```bash
SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.not-a-real-key
JWT_SECRET=local-dev-only-not-used
DEV_MODE=true
BACKEND_URL=http://localhost:8000
ALLOWED_ORIGINS=["chrome-extension://","http://localhost:3000"]
GEMINI_API_KEY=          # put a real key here if you want real generated copy
```

`extension/.env`:

```bash
VITE_DEV_MODE=true
VITE_MOCK_MODE=true      # set false with a real key for authentic output
VITE_BACKEND_URL=http://localhost:8000
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.not-a-real-key
```

Then:

```bash
cd backend && python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
curl http://localhost:8000/health          # {"status":"ok","service":"clientlens-backend"}

cd ../extension && npm install && npm run dev
```

Load `extension/dist/` at `chrome://extensions` with Developer mode on. The panel opens straight into an admin session; there is no login step.

**For screenshots that will be seen by thousands of people, use a real LLM key and turn mock mode off.** Mock responses are canned and a sharp-eyed viewer can tell. One Gemini Flash key on the free tier is enough for a screenshot session. Placeholder Supabase is fine either way; nothing in these six shots depends on real persistence.

## Capture settings

- **Retina or 2x display.** A 1x screenshot of a Chrome side panel looks bad scaled up on PH.
- **Browser zoom 110 to 125%** so sidebar text is legible in a PH gallery thumbnail.
- **Clean profile:** bookmarks bar hidden, no notification badges, no other tabs with real names.
- **Fake company, fake prospect, always.** Use the sample-data toggle or invent a company. Never a real prospect, never a real logo you do not have rights to.
- Save to `docs/screenshots/` as PNG. Name them by what they show, not by number.

## The six that matter

Ordered by launch value. If you only capture three, capture the first three.

### 1. `live-mode-coaching.png` (the hero shot)
Full browser window: Meet call on the left, Wingman side panel on the right, with a coach cue and a sentiment reading both visible. This is your PH gallery image #1 and the top of the README. Everything else is supporting evidence.

### 2. `objection-citation-hover.png`
The objection composer with an inline `[1]` chip hovered so the source-quote tooltip is open. This is your only visual proof of the "every number is traceable" claim, which is the actual differentiator. Make sure the tooltip text is a real, readable quote from a KB entry.

### 3. `post-call-summary.png`
A rendered post-call summary: agenda coverage, sentiment timeline, objections raised, action items. Shows the loop closing.

### 4. `pitch-generation.png`
Mid-generation is better than finished: the `GenerationProgress` view showing a live stage transition such as "Checking brand compliance" makes the multi-agent council legible in a way a finished deck does not.

### 5. `knowledge-base.png`
The KB panel with 5 or 6 realistic entries loaded and the usage meter visible. Answers "where do the citations come from" without a word of copy.

### 6. `meet-transponder.png`
The in-Meet overlay on `meet.google.com`, showing the company chip, sentiment, and current cue. Proves the non-intrusive claim. Frame it so the Meet video is visible behind the overlay.

## Where each one goes

| Asset | PH gallery | README | Landing page |
|---|---|---|---|
| Demo video | Item 1 | Embedded GIF (shots 3 and 4) | Optional |
| `live-mode-coaching` | Item 2 | Top, above Table of Contents | Hero, replacing the CSS mockup |
| `objection-citation-hover` | Item 3 | Objection Composer section | Feature 1 block |
| `post-call-summary` | Item 4 | Live Meeting Copilot section | Feature 3, replacing the album grid |
| `pitch-generation` | Item 5 | Pitch Generation section | Feature 2 block |
| `knowledge-base` | Item 6 | KB section | Not needed |
| `meet-transponder` | Optional | Live Meeting Copilot section | Not needed |

## Note on the landing page

The landing page currently renders fake product UI in CSS: the `mock-sidebar` block and the Spotify-style `album-grid`. They look good, but they are illustrations of a product rather than the product. Once you have shots 1, 2, and 3, swapping them in is a strict upgrade in credibility, and it is the one change to the page that is worth touching the design for.

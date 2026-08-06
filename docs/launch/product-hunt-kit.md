# Product Hunt launch kit

Everything you paste into the PH form, plus the first comment. Written for an **open-source, self-host** launch: the ask is "try it, use it, improve it", not "install now".

Do not launch until the items in [`launch-checklist.md`](launch-checklist.md) marked **blocker** are done.

---

## Name and tagline

**Name:** Project Wingman

**Tagline** (60 char limit, PH counts strictly):

> Open-source AI sales copilot for your browser sidebar

That is 52 characters. Alternatives, all under 60:

- `The open-source sales copilot that runs on your keys` (52)
- `Live call coaching that cites its sources. Open source.` (55)
- `Open-source AI copilot for live sales calls` (43)

Lead with "open source". It is the single most clickable word you own, and it is the honest frame for a self-hosted launch.

## Description (260 char limit)

> Wingman coaches you during live Google Meet calls: sentiment, agenda pacing, objection handles, and a validator that fact-checks every number before you say it. Pitches are grounded in your own knowledge base. MIT licensed, runs on your own LLM keys.

258 characters. Every claim in it is true today.

## Topics

Pick from PH's list, in priority order: `Sales`, `Artificial Intelligence`, `Chrome Extensions`, `Open Source`, `SaaS`, `Productivity`.

## Links

- **Website:** the GitHub Pages landing page
- **GitHub:** the repo (this is the real destination, make sure it is dressed, see checklist)

---

## The first comment

Post this the moment the launch goes live. It sets the tone of the entire thread. Do not open with "excited to share"; PH readers have filter-blindness to it.

### Primary version

> Hey Product Hunt.
>
> I built Wingman because of one specific moment I kept losing: a prospect pushes back on price, and I have thirty seconds to answer with a number I actually trust. Every tool I tried either sat outside the call, or happily invented a statistic that I would then have to walk back on the next call.
>
> So Wingman is a Chrome side panel that runs during your Google Meet calls. Five agents work on the live transcript: sentiment, agenda pacing, a coach that surfaces the next-best sentence, objection handling, and a validator whose only job is to reject any number that is not traceable to a source in your knowledge base. If a claim has no citation, you do not see it.
>
> The part I care most about: **there is no Wingman server.** It is MIT licensed and self-hosted. You run the backend, you plug in your own Anthropic, Gemini, Groq, or any OpenAI-compatible key, and your call transcripts go to your provider instead of mine. No telemetry back to me. That is a deliberate constraint, not a stage I am waiting to grow out of.
>
> Being straight about where it stands: this is v1.0 open beta, built solo. Setup is a developer task today (self-hosted backend, your own keys) and there is no Chrome Web Store listing yet. Zoho is the only CRM wired up; HubSpot and Salesforce are next. Google Meet is the only meeting surface that works end to end. And the honest one: **authentication is not wired yet.** v1.0 assumes one rep running their own backend on their own machine, so the sidebar opens straight into an admin session and the backend runs in dev mode. That is documented in the security section rather than buried, it is the top item on the roadmap, and it is why I say self-hosted-single-user rather than team-ready.
>
> What I would genuinely like from you: if you run sales calls, tell me where the coaching cue fires at the wrong moment. That is the hardest part to get right and the part I cannot solve alone. Issues and PRs are open, and the backlog is public.

Roughly 300 words. Long for a first comment, but the honesty section is what earns the thread, so keep it.

### Shorter version, if you want it punchier

> Hey Product Hunt.
>
> The moment that made me build this: a prospect pushes back on price, and I have thirty seconds to answer with a number I actually trust. Tools either sat outside the call or invented a statistic I would have to walk back later.
>
> Wingman is a Chrome side panel for live Google Meet calls. Five agents run on the transcript: sentiment, agenda pacing, a coach that surfaces the next line, objection handling, and a validator that rejects any number not traceable to your knowledge base. No citation, no claim.
>
> There is no Wingman server. MIT licensed, self-hosted, your own LLM keys, no telemetry back to me.
>
> Honestly: v1.0 open beta, built solo, setup is still a developer task, no Web Store listing yet, Zoho-only CRM, and auth is not wired so it assumes one rep on their own backend. All of that is in the README rather than buried.
>
> If you run sales calls: tell me where the coaching fires at the wrong moment. That is the part I cannot solve alone.

---

## Reply templates for the thread

Have these ready. Speed of reply matters more than polish on launch day.

**"How is this different from Gong or Chorus?"**
> Different job. Gong and Chorus are mostly revenue-intelligence: they record, analyse afterwards, and report to managers. Wingman is rep-facing and in-the-moment, and it is built to keep you honest live rather than grade you later. The other difference is structural: they are SaaS with your calls on their servers, this is MIT and self-hosted with your calls on your own provider. If you need pipeline analytics for a VP, use Gong. If you want a copilot that will not let you say an uncited number, use this.

**"Why do I have to self-host? That is a lot of friction."**
> Fair, and I will not pretend otherwise. The honest reason is that the alternative is me holding your call transcripts, and I did not want to build that. It also means switching LLM providers is a config change instead of waiting for me. A Web Store listing is coming for the extension half, which removes most of the friction, but the backend stays yours.

**"Does it work with Zoom or Teams?"**
> Not yet, in any real sense. There are Zoom and Meet cards in the Integrations panel, but Google Meet is the only surface that works end to end today. Teams is on the roadmap. I would rather say that plainly than have you find out mid-call.

**"What does it cost?"**
> The software is free and MIT licensed. Your cost is whatever your LLM provider charges, and Deepgram if you use live transcription. Gemini Flash has a free tier that is enough to evaluate the whole thing. There is a per-user daily token budget in the backend so a runaway index job cannot surprise you.

**"How do you stop it hallucinating numbers?"**
> Two layers. The generation agents are instructed to cite a `source_id` for every numeric claim, and then a separate validation agent re-checks each number against the retrieved sources and rejects anything unsourced. The objection composer emits inline citation markers, and hovering one shows you the exact source quote. It is not magic and a wrong source still produces a wrong answer, but "confidently uncited" is the specific failure it is built to prevent.

**"Wait, there's no login? Isn't that insecure?"** (Expect this from anyone who reads the source. Answer it before they have to ask.)
> Correct, and it is deliberate for v1.0 rather than an oversight I am hoping nobody notices. The assumption is one rep running the backend on their own machine, bound to localhost, so the sidebar opens straight into an admin session and the backend runs in dev mode. The RBAC matrix and JWT middleware are written and they run, they just have no real identity to check yet. The consequence is spelled out at the top of the security section: do not put that backend on a public URL, because anyone who finds it can spend your LLM budget and read your knowledge base. Wiring real sign-in is the number one roadmap item, and it is what gates a shared team deployment. I would rather ship this stated plainly than imply a security property I have not built.

**"Is the code actually good or is this a weekend project?"**
> Judge it yourself, that is the point of MIT. Honest assessment: the extension is the mature half, the backend is smaller than it looks, and test coverage is thin because most of the surface is Chrome APIs that a harness does not reach. There is a public UX and workflow audit backlog if you want to see the known gaps rather than discover them.

---

## Launch-day hygiene

- **Post the first comment immediately**, not an hour in.
- **Reply to every comment for the first six hours.** Thread depth drives ranking more than upvote count.
- **Do not ask for upvotes anywhere.** PH penalises it and the community notices.
- **Have the repo watched, not just starred.** Ask people who want the Web Store release to hit Watch, since that is your only notification channel until you add an email list.
- **Expect the top question to be "why self-host".** The reply above is your best asset. Lead with the privacy reason, not the technical one.

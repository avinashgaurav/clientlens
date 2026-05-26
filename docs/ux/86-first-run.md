# #86 — First-run experience (investigation)

**Status:** investigation, no code change yet. Decision needed before implementation.

## TL;DR

Today's first-run is: install → Google sign-in → land on **Generate** tab with an empty form, KB empty state is a single italic line ("Empty. Add the partner kit docs to get started."), Copilot tab shows the full pre-call form even before the rep has anything to set up.

The reasonable paths:

- **Option A** — Aggressive demo mode: pre-populate mock KB + mock call history + a sample transcript on first install. Rep sees the populated product before they do anything.
- **Option B** — Guided empty states: every empty surface gets a friendly "here's what this is for" card + one CTA. No mock data.
- **Option C** — Hybrid: guided empty states by default, plus a one-click "Try with sample data" toggle (and a "Clear sample data" reset) in Settings.

**Recommendation: Option C.**

## Current empty-state inventory

| Surface | Current behavior | Quality |
|---|---|---|
| Insights tab | Real `EmptyState` component with icon, copy ("No calls yet"), and pointer to Copilot tab. Retention note ("30 days · stored locally"). | ✓ Solid (shipped in #43) |
| Knowledge tab | `<p className="text-xs text-slate-500 italic">Empty. Add the partner kit docs to get started.</p>` (`KnowledgeBasePanel.tsx:469`). Single line, no icon, no CTA. | ✗ Underweight |
| Copilot tab | No explicit empty state — full pre-call form renders unconditionally. Calendar / Paste / Manual paths shown together (smart-hide from #78 only kicks in after a path commits). | ✗ Form-as-empty-state |
| Generate tab | No empty state — `PersonalizationForm` is the landing surface. Acceptable since the form IS the input. | ~ Acceptable |
| OnboardingChecklist | Renders at top of every tab when items pending; collapses to pill when complete (#80). | ✓ Solid (shipped in #80) |

What's missing systemically:
1. **No demo data anywhere.** A first-time user can't see what a populated KB or finished call summary looks like before doing the work themselves.
2. **No default-tab guidance.** Rep installs → lands on Generate → form needs inputs they don't have yet. The auto-switch-to-Copilot landed in #79, but that only fires if a Meet is open.
3. **KB empty state is too quiet** — the most underweight surface, and KB is the highest-leverage thing to populate (every council relies on it).

## Option A — Aggressive demo mode

Pre-populate on first install:
- 5–6 mock KB entries (product overview, case studies, battlecards, pricing one-pager, security doc) with realistic but clearly-fake content.
- 4–6 mock call records in the call-history store with the InsightsPanel `MOCK_CALLS`-shaped fields (#43 already designed for this).
- A pre-recorded Copilot transcript replay that runs when the rep opens the Copilot tab without a real Meet.
- A "First-run banner" on every tab: "You're looking at sample data — clear it from Settings when you're ready."

Pros:
- Rep sees the product working before doing any work. Highest conversion to first-real-use.
- The Copilot tab finally has something to show before a real Meet.

Cons:
- Migrating from sample to real is jarring — "where did the sample calls go?"
- KB pollution risk: if the rep generates a real deck while sample KB is loaded, the council pulls quotes from the fake content.
- The pre-recorded transcript replay is a non-trivial build (new infra for time-keyed events).
- Confusing for power users who skip onboarding and never realize their data is mock.

Estimated work: ~5 days. New mock-data fixtures + a "demo mode" flag in settings + Copilot transcript replay infrastructure + cleanup flow.

## Option B — Guided empty states

Every empty surface gets a friendly card with icon, copy, and one CTA. No mock data ever.

Per surface:
- **KB empty (0 entries):** Card with sources-icon, copy "Your sales playbook lives here. The council uses it to ground every pitch.", CTA "Add your first entry → opens the Add UI." Plus a secondary "Browse a sample entry" link that opens a docs page (not in-product mock data).
- **Copilot empty (no session):** Card with mic-icon, copy "Wingman copilots your live meetings. Connect Calendar or paste a meeting URL to start.", CTA links to the existing onboarding paths (already shown — this becomes a hero above them).
- **Insights empty:** No change — #43's EmptyState is already in this shape.

Pros:
- Zero data-cleanliness risk (no migrating sample → real).
- Cheap to implement — every surface is just adding a card.
- Forces the rep into real onboarding from the start.

Cons:
- Rep still doesn't see what "good" looks like until they populate it themselves.
- The Copilot tab's "card above onboarding paths" is just more vertical real estate before they can start.

Estimated work: ~2 days. Per-surface card components + KB-specific empty state with CTA wiring.

## Option C — Hybrid (recommended)

Default: Option B's guided empty states.
Opt-in: A Settings toggle "Try Wingman with sample data" that:
- Loads mock KB entries into the KB store (tagged with a `_demo: true` flag in metadata).
- Loads mock call records into the call-history store (tagged similarly).
- Shows a dismissable banner on every tab: "Demo data loaded — clear from Settings."
- Toggle off → clear all entries with `_demo: true`. Real entries untouched.

Pros:
- Cold-start ergonomics: guided onboarding for new users, demo on demand for the "show me first" crowd.
- Zero pollution risk if demo entries are tagged and cleared atomically.
- Doesn't require the Copilot transcript replay (deferred — file separately if Option A's replay is wanted later).
- Settings-driven, reversible, discoverable.

Cons:
- Two paths to maintain. The tagged-cleanup logic is the one thing to get right (test it explicitly).
- Slightly more discoverable than A (sample data isn't the first thing they see), but the Settings toggle + "Try sample data" CTA on KB empty state can surface it.

Estimated work: ~3 days total. Breakdown:
1. KB empty-state card with "Try sample data" CTA (~0.5 day) — file as a sub-issue.
2. Copilot empty-state card above onboarding paths (~0.5 day).
3. Sample-data fixtures (KB + call records) + `_demo` tagging (~0.5 day).
4. Settings toggle + load/clear flow (~1 day).
5. First-install banner + dismissal (~0.5 day).

## Recommendation

**Option C.** Concrete sub-issues to file once approved:

1. KB empty-state card with one-click "Try sample data"
2. Copilot empty-state card (replaces "full form on first open")
3. Sample-data fixtures + `_demo` tag + cleanup
4. Settings toggle "Try Wingman with sample data" / "Clear sample data"

(Insights empty state already covered by #43.)

## Out of scope (this investigation)
- Implementation — lives in the follow-up sub-issues.
- Onboarding tour / spotlight UI (separate concern; file separately if wanted).
- Auto-launching a Copilot demo session with a pre-recorded transcript (Option A's replay infrastructure — defer).

## Open questions for the user

- Confirm Option C is the right pick (vs B for less work, A for more aggressive demo).
- For the KB sample entries: should they be your real company's docs (faster to write, but harder to remove) or generic stand-ins ("Acme Cloud product overview")?
- Should the "Try sample data" CTA appear on the **Insights** empty state too, or only on KB and Copilot?

# Workflow + UX audit

**Status:** Diagnostic + prescriptive. Drafted post-#101 / #103-#108 / #109 / #110 / #111(design). Reflects the product as of `main @ e27af94`.

**Scope:** Every rep-facing workflow, audited against today's code (not the issue-tracker narrative which is sometimes stale). Diagnostic table covers all 8 workflows; the top 3 highest-leverage ones get deep prescriptive treatment with files/effort/sub-issues.

**Source-of-truth grounding:** This doc inherits locked decisions from `voice.md`, `86-first-run.md`, `83-generate-preview.md`, `87-skin-consistency.md`, `content-audit.md`, `objection-composer.md`. It does **not** re-litigate any of those, it picks up the still-unshipped reco's and identifies new friction.

**Already-shipped (do not re-audit):** Voice sweeps (#103–#108) · Smart-skip Preview (#82/#91) · Onboarding-paths smart-hide (#78) · Pill-when-complete checklist (#80) · Sample-data hybrid first-run (#92/#93/#94/#95/#98) · Quick Settings popover (#109) · Cross-tab storage sync (#42–#44) · PM-OS README (#110).

**Not-yet-shipped reco's from earlier docs (pulled forward into this audit):**
- `87-skin-consistency.md`: drop `linear` skin, converge `live` base with `brand`.
- `objection-composer.md`: Approach 1, inline `[N]` markers + collapsible reasoning. Sub-issues to file.

---

## Part 1: Diagnostic: all 8 workflows

For each: **today's flow** · **friction** · **leverage** (how much rep time / per-call value at stake). H/M/L. No prescriptions in this part.

### W1. First-run (install → first real use)
- **Today:** Install → Google sign-in → land on Generate tab → empty form. KB empty (1-line italic until sample-data toggle hit). OnboardingChecklist at top until complete. `CopilotEmptyState` hero only on Copilot tab if no session + no history.
- **Friction:**
  - Empty Generate form is the landing surface, first thing the rep sees has no demonstration of value. Sample-data toggle exists but is buried in Settings / Quick Settings / KB-empty CTA. Discoverability ≠ defaultness.
  - The OnboardingChecklist sits *above* every tab's content, even on first-open. Adds vertical real estate before the rep sees the product itself.
  - No "what is this?" callout for a fresh install. The README is good but the rep never sees the README in-product.
- **Leverage:** **H**, conversion to first-real-use is the highest-leverage gate. Every rep who installs and doesn't experience value churns silently.

### W2. Generate pitch (async pre-call prep)
- **Today:** Generate tab → `ModeSwitcher` (pitch/email/objection) → `LiveModeToggle` → `PersonalizationForm` → auto-fetch assets → **smart-skip Preview** (#82/#91) → `CouncilRunner` (4 agents) → `ResultPanel` (slides + render).
- **Friction:**
  - `ModeSwitcher` puts pitch / email / objection at the same level inside Generate tab. Email and objection have nothing to do with "generating an asset", objection especially is a mid-call workflow, not async. The mode switcher is doing IA work that the tab strip should do.
  - `LiveModeToggle` adds yet another control above the form. What it does is non-obvious from the label.
  - `PersonalizationForm` is long. Reps who run the same play repeatedly retype.
  - Result panel ships slides but the export path (PDF/PPT) is only via menu items in the panel, no obvious "send to deck" CTA.
- **Leverage:** **H**, most-used async surface for non-Meet workflows.

### W3. Mid-call objection (highlight → response → paste)
- **Today:** Two entry points: (a) Generate tab → ModeSwitcher → "objection" → paste text manually; (b) any page → highlight → right-click → "Project Wingman: Handle objection" → opens sidebar → `ObjectionPanel`. Result is single response card + separate citations card + copy button.
- **Friction:**
  - Path (a) is wrong: putting objection inside the Generate tab implies it's an async task. Mid-call reps land on the Generate tab (default), see "objection" as a sub-mode, paste, wait. The Generate tab's mental model is broken by hosting a real-time workflow.
  - Path (b) is right but slow to surface, the sidebar opens cold, ObjectionPanel renders from scratch, no pre-warmed state.
  - Citations live below the response: see #111 (objection-composer design doc), already designed.
  - No keyboard shortcut to invoke objection capture (mid-call reps want `⌘⇧O`-shaped affordances).
- **Leverage:** **H**, per-call real-time value. Misfire = rep loses the moment.

### W4. Mid-call copilot (Calendar/Paste/Manual → Start → live → end → summary)
- **Today:** Auto-switch to Copilot tab when Meet open (#79). 3 onboarding paths smart-collapse to one (#78). `CopilotEmptyState` hero only on cold-start. Start → `startLiveOrchestrator` → transponder injects into Meet tab → live agents stream (sentiment/agenda/coach/objection) → End → post-call summary → CRM push or MD download.
- **Friction:**
  - Even after smart-hide, the pre-call form is still long: Prospect (company/persona/URL with lookup) + Meeting context + Agenda editor. On a 360px sidebar, this is a lot of scrolling **before the meeting starts**, which is the worst time to ask the rep to scroll.
  - The "Recent calls" chip strip appears only after history exists, first 3 calls have no pre-fill option.
  - `meetingUrl` "Look up" button is on a separate row from the URL input. Auto-trigger on paste/blur would save a click.
  - The agenda editor is fine but the priority dropdown (Must/Should/Nice) takes width that's expensive at 360px.
  - Transponder status messages ("Transponder opened on the Meet tab.") render inline in the panel, useful once, noise after.
  - Post-call summary lands in the same panel. There's no "send to next-call prep" affordance (closing the loop: this call's notes → next call's `meetingNotes`).
  - "Push CRM note" failure mode ("No CRM configured. Open Settings…") is good but the Settings round-trip drops the summary state.
- **Leverage:** **H**, this is the product's marquee differentiator. Every friction here compounds across every call.

### W5. Email council (compose → 4-agent → preview → send)
- **Today:** Generate tab → ModeSwitcher → "email" → `EmailComposer` → 4-agent council (retrieval → ICP → brand → validation) → preview → copy.
- **Friction:**
  - Same IA problem as W3: email composition lives under "Generate" but it's a separate workflow. ModeSwitcher hides it.
  - 4 agents = 4 visible cards in the result. Mid-task, the rep wants the email, not the trace. (Same problem #84 design doc solves for objection, applies here too.)
  - No template library / starred prompts despite reps running near-identical prompts daily.
- **Leverage:** **M**, frequently used but async, lower per-event stakes than mid-call.

### W6. Post-call insights (history → call detail → trace)
- **Today:** Insights tab → `InsightsPanel` (this-week stats + recent calls table from `useCallHistory`) → click row → drilldown.
- **Friction:**
  - "This week" 7-day vs "Total" 30-day windows are correct but unlabeled in the chip, rep has to remember which is which.
  - No trend over time (rolling 4-week comparison).
  - Drilldown shows the saved markdown summary but not the agent trace from the live session.
  - No search / filter on call history: only chronological. Once you have 30+ calls, finding "the demo with the CFO who pushed back on price" is hunt-and-peck.
- **Leverage:** **M**, high-value for power users, low-value for first-30-days reps.

### W7. Settings + Quick Settings (passcode-gated heavy + popover light)
- **Today:** Heavy settings live in `SettingsPanel` behind admin passcode (API keys, integrations, knowledge upload paths). Quick Settings (#88/#109) is a sliders icon → popover with Provider, Model, Deep Research, Sample Data.
- **Friction:**
  - Two settings surfaces is a reasonable split, but discovery is fragmented. The sliders icon is small in the header; first-time reps don't know they can change provider mid-call from there.
  - The passcode gate is a hard wall: useful for "don't paste your API key on a shared laptop" but punishing for solo users who have to retype it.
  - Quick Settings opens a popover but doesn't have a "more settings →" link to the passcode-gated full panel. They feel like disconnected surfaces.
- **Leverage:** **M**, power-user surface, infrequent.

### W8. Cross-surface consistency (sidebar / popup / transponder / landing)
- **Today:** 6 skins (`brand`/`live`/`insights` in sidebar, `linear` in popup, `vercel` in transponder, `spacex` in landing). Per #87 audit, `linear` and `live` are visually near-identical to `brand` on shared content.
- **Friction:**
  - `87-skin-consistency.md` already proposed: drop `linear` (popup adopts `brand`), converge `live` base tokens with `brand`. **Not shipped.** Today the visual difference between Generate tab and Copilot tab is below perceivable threshold; the popup's distinct skin is theatre.
  - Popup is a launcher: clicks go straight to the sidebar. The popup's brief on-screen moment doesn't justify maintaining a separate token block.
- **Leverage:** **L**, pure tech-debt + small mental-model cleanup. Doesn't change rep behavior. Cheap to ship though.

---

## Part 2: Prescriptive: the top 3 highest-leverage workflows

### Top 3 by leverage × frequency:

1. **W4: Mid-call copilot** (H × per-call)
2. **W1: First-run** (H × one-shot but conversion gate)
3. **W3: Mid-call objection** (H × per-call mid-call)

Each gets: **proposed change** · **files to touch** · **effort** · **sub-issue to file**.

---

### Prescriptive 1: W4 Mid-call copilot

**The single highest-leverage change: shrink pre-call setup to one screen.**

Today's flow has Prospect (3 fields + URL lookup), Meeting context (2 fields), Agenda (n rows). That's 5–8 fields before the rep can hit Start. Mid-call this is murder.

#### Change 1.1: Pre-call mode = "minimum viable Start"

- **What:** Render only `company` + `persona` + the meeting-URL input on cold-start. Everything else (agenda, meeting title, meeting notes) collapses behind a `▾ More context (optional)` disclosure.
- **Why:** The Start button gate is `readyToStart = companyName.trim() && personaRole.trim()` (`MeetingCopilotPanel.tsx:431`). That's the button-gate only, the orchestrator separately needs a resolved Meet tab ID (`startSession()` at `:240` calls `chrome.tabs.query` for `https://meet.google.com/*` and tolerates a missing tab by running the copilot in-panel only). The disclosure proposal still holds: agenda + meeting context aren't required for any code path; they're enhancement.
- **Files:** `extension/src/sidebar/components/MeetingCopilotPanel.tsx`, wrap the Meeting context + Agenda blocks in a disclosure component. Persist the expanded/collapsed state per-session so the rep doesn't recollapse mid-flow.
- **Effort:** ~½ day.

#### Change 1.2: URL "Look up" auto-fires on paste

- **What:** When the rep pastes into the `meetingUrl` input, fire `handleLookupUrl()` automatically after 200ms debounce instead of requiring a separate button click.
- **Why:** The button is one extra friction point that exists to defer cost. The cost (one LLM call to parse the URL) is already paid eagerly when the rep clicks, auto-firing on paste is the same cost, no extra click.
- **Files:** `extension/src/sidebar/components/MeetingCopilotPanel.tsx:171`, wrap the input `onChange` with a debounced paste-detector. Keep the manual button for non-paste typing edge cases (or remove it; it's redundant if paste covers 95%).
- **Effort:** ~¼ day.

#### Change 1.3: Auto-end-session detection

- **What:** When the Meet tab closes (`chrome.tabs.onRemoved`), automatically transition session to `ended` and fire `generatePostCallSummary` if there's transcript content. Today the rep has to remember to hit "End session & summarize."
- **Why:** Reps close Meet at the end of a call and immediately context-switch. The current "go back to the sidebar and click End" step has a non-zero drop-off, sessions sit in `listening` state forever. Telemetry would prove it; the prior is high.
- **Files & wiring:** `useMeetDetection.ts` today only returns a `boolean` (`hasMeetTab`), it does not emit a tab-closed event. Two options: (a) extend the hook's return shape with an `onTabClosed` callback registration; or (b) in `MeetingCopilotPanel`, add a `useEffect` watching `hasMeetTab` for `true → false` transitions during an active session, then trigger the existing `stopSession()` logic. Option (b) is the smaller diff. Either way the hook IS the right surface, but the wiring is non-trivial, not "subscribe to an existing event."
- **Effort:** ~¾ day (revised up from ½). Includes the boolean-transition logic + handling the race where the rep stops manually first + verifying the auto-stop doesn't double-fire on tab refresh (which also flips `hasMeetTab` momentarily).

#### Change 1.4: Recent-calls chip drives `meetingNotes` carry-forward

- **What:** When a rep clicks a "Recent calls" chip, pre-fill `meetingNotes` with the saved summary's "Action items" + "Suggested follow-up email" so the *next* call inherits the carry-over context automatically.
- **Why:** Closes the loop: this call's output → next call's input. Today the chip pre-fills `company`, `persona` (`:585–586`), and the full markdown into `notes` (`:587`), but the markdown is the whole transcript dump, way too much. Slicing to action items + follow-up is the actually-useful subset.
- **Files:** `MeetingCopilotPanel.tsx:587`, replace `setMeetingNotes(h.summary_markdown)` with `setMeetingNotes(extractCarryForward(h))`. New helper in `extension/src/sidebar/utils/`.
- **Caveat:** `summary_markdown` has no enforced structure, it's whatever `summaryToMarkdown()` (`:948`) produces. The helper must regex-match the `## Action items` / `## Suggested follow-up email` section headers and **fall back to the full `summary_markdown`** if either header is absent (e.g., if the summary template changes or the rep had no action items). Silent degradation is worse than the current verbose behavior.
- **Effort:** ~¼ day.

#### Change 1.5: Persistent transponder status → toast instead of inline

- **What:** "Transponder opened on the Meet tab." should be a 3s toast, not a persistent inline message. After 30 calls the rep stops needing to see it.
- **Files:** `MeetingCopilotPanel.tsx:683`, replace inline render with a toast call. **No toast component exists in the codebase today**, this change brings one in (plus a host + portal at the root of `App.tsx`).
- **Effort:** ~½ day, including adding a minimal toast primitive. Defer if not worth the new component.

**Sub-issues to file for W4:**
- `UX: Copilot, collapse meeting-context + agenda behind "More context" disclosure (#79b)`
- `UX: Copilot, auto-fire URL lookup on paste (#79c)`
- `UX: Copilot, auto-end session when Meet tab closes (#79d)`
- `UX: Copilot, recent-calls chip carries forward action items + follow-up only (#79e)`
- `UX: Copilot, transponder status as toast (optional, #79f)`

**Combined effort for 1.1–1.4:** ~1½ days. Material per-call win.

---

### Prescriptive 2: W1 First-run

**The single highest-leverage change: don't land on an empty Generate form.**

Today's cold-start lands on Generate (empty form). The rep's first impression is "fill out a form", exactly the wrong message for a product that's supposed to demonstrate AI value.

#### Change 2.1: First-install auto-loads sample data + lands on Copilot

- **⚠️ Deliberate override of a locked decision:** `86-first-run.md` selected Option C (opt-in toggle in Settings) as the chosen path, and that doc is listed as inherited. This change **upgrades opt-in → opt-out for first install only**. Requires explicit ratification before any sub-issue is filed, the override is documented here, not buried.
- **What:** On first install (detected via absence of a `clientlens_install_seen` storage key), automatically `loadSampleData()` + switch the default tab to Copilot + show the `CopilotEmptyState` hero with the sample-data already loaded message. Set the flag so subsequent opens land normally.
- **Why:** Sample data already exists (#94/#95). It's behind a toggle that first-time reps will never find before churning. Opt-in is being beaten by churn, opt-out (with a prominent dismissal/clear path) demonstrates value in 0 clicks instead of N clicks-to-discover. Rep can clear in two clicks from Quick Settings; the welcome banner (Change 2.2) tells them where.
- **Files:**
  - `extension/src/sidebar/App.tsx`: `useEffect` on mount: check `chrome.storage.local.get('clientlens_install_seen')`, if missing → load sample, set tab to copilot, set flag.
  - `extension/src/shared/utils/sample-data.ts`: already idempotent; safe to call. Add a "first-install" telemetry event.
  - `extension/src/sidebar/components/MeetingCopilotPanel.tsx:1004`: `CopilotEmptyState` already exists; add a "← Try the sample call summary in Insights" link as a secondary CTA so the rep sees populated data immediately.
- **Effort:** ~½ day.

#### Change 2.2: In-product first-run callout

- **What:** A one-time slim banner above the active panel (not the OnboardingChecklist, separate, dismissible) with: "Welcome, Wingman is loaded with sample data. Try Insights to see what a finished call looks like. Clear samples in Quick Settings (sliders icon)." 14-day dismissal expires; reappears if they reinstall.
- **Why:** Tells the rep *why* they're looking at sample data and *where* to clear it. Without it, the auto-load looks like a bug.
- **Files:** New component `extension/src/sidebar/components/FirstInstallBanner.tsx`. Render in `App.tsx` above the active panel, gated on `clientlens_install_seen` flag and a separate `clientlens_first_install_banner_dismissed` flag.
- **Effort:** ~½ day.

#### Change 2.3: OnboardingChecklist below first-render

- **What:** The OnboardingChecklist renders above every tab today. On first-install with sample data, this is doubly redundant, the rep should be *exploring*, not seeing a "Add your first KB entry" checklist with sample KB already loaded.
- Move the checklist to a collapsible drawer at the **bottom** of the side panel, not the top. When complete (per #80), it collapses to a pill in the header.
- **Why:** Real estate at the top of a 360px panel is the most-valuable surface. The checklist is reference, not action.
- **Files:** `extension/src/sidebar/components/OnboardingChecklist.tsx` (re-style as bottom drawer, likely `position: sticky; bottom: 0` inside the scroll container, OR a separate flex row outside the scroll container, OR a portal to body) + `App.tsx:200` (move below the panel content; if using sticky, may need to restructure the flex column at `:149`).
- **Effort:** ~¾ day (revised up from ½). The layout at 360px with a scroll-container panel is the actual cost, naive bottom-of-flow render will scroll off-screen with content; sticky positioning requires touching the parent flex grid. **Must regression-test the #80 pill-when-complete behavior** before merging, that's the bigger risk than the layout itself.

**Sub-issues to file for W1:**
- `UX: First-install, auto-load sample + land on Copilot, opt-out (#86b)`
- `UX: First-install, welcome banner explaining sample data + where to clear it (#86c)`
- `UX: Onboarding checklist, move to bottom drawer, not top of panel (#86d)`

**Combined effort:** ~1½ days. Highest-leverage one-time work in the product.

---

### Prescriptive 3: W3 Mid-call objection

The objection-composer design doc (#111) covers the response-side UX. This section covers the **capture + surfacing** side, which the design doc explicitly scoped out.

#### Change 3.1: Move objection out of Generate-tab ModeSwitcher

- **What:** Objection is not a Generate workflow. Remove "objection" from `ModeSwitcher` (Generate tab's pitch/email/objection sub-selector). The only entry to ObjectionPanel becomes the right-click context menu (already wired) + a new keyboard shortcut.
- **Why:** Hosting a mid-call real-time workflow under the "Generate" tab fights the IA. Reps mid-call who land on the Generate tab will see "objection" as a sub-mode and assume that's the right place, then have to switch sub-modes, a step they don't have time for.
- **Files:** `extension/src/sidebar/components/ModeSwitcher.tsx` (remove option) + `App.tsx:223` (remove `outputMode === "objection"` render path) + **`extension/src/sidebar/stores/app-store.ts`**: audit the initial value of `outputMode` and the setter, if it ever lands on `"objection"` by default, change to `"pitch"` and tighten the `OutputMode` union to drop `"objection"`. Otherwise the tab will silently render nothing on cold-start when something writes `"objection"` to storage. The Objection panel still lives, it's reached only via context-menu capture or the keyboard shortcut below.
- **Effort:** ~½ day. Telemetry: confirm the in-Generate-tab path was rarely used before deleting (or feature-flag it for a transition).

#### Change 3.2: Add keyboard shortcut for objection capture

- **What:** Register a Chrome command (`commands` in `manifest.json`) bound to a default like `Alt+Shift+W` (configurable in `chrome://extensions/shortcuts`). When fired:
  1. Get the active tab's selected text via `chrome.scripting.executeScript`.
  2. Stash it into `chrome.storage.session` under `pending_objection` (matches the existing context-menu pattern at `ObjectionPanel.tsx:23`).
  3. Open the side panel programmatically + send `OBJECTION_CAPTURE` runtime message.
- **Why:** Mid-call reps live on the keyboard. Right-click → menu navigate is 2–3 seconds of mouse work. Shortcut is one chord.
- **Files:** `extension/public/manifest.json`, add both `"commands"` (the keyboard shortcut declaration) and verify `"scripting"` is in `"permissions"` (required for `chrome.scripting.executeScript`; check it's present, add if not). Plus `extension/src/background/service-worker.ts` (handle `chrome.commands.onCommand`) + verify the existing `OBJECTION_CAPTURE` handler at `ObjectionPanel.tsx:32`.
- **Effort:** ~1 day. Coordinated change across manifest + service worker + content script (the selected-text fetch is the trickiest because the active tab might not be an HTTP page).

#### Change 3.3: Objection panel pre-warms on capture

- **What:** When `OBJECTION_CAPTURE` fires, scroll the panel to ObjectionPanel and pre-focus the textarea. If a competitor hint is detected in the captured text (regex: "Cast.ai", "Spot", "Densify", etc.), pre-fill the competitor input.
- **Why:** Cuts ~2s of mid-call fumble.
- **Files:** `ObjectionPanel.tsx`, useEffect on `OBJECTION_CAPTURE` listener, add ref + scrollIntoView + autoFocus, add competitor regex match against `objectionInput.objection_text`.
- **Effort:** ~¼ day.

#### Change 3.4: Defer to #84a/b/c for response-side UX

- The response-side composer is already designed in PR #111. Do not duplicate that work here. After #84a/b/c land, the full mid-call objection workflow becomes: shortcut → pre-warmed panel → composer with inline `[N]` markers → copy. End-to-end ≤4 seconds.

**Sub-issues to file for W3:**
- `UX: Objection, remove from Generate tab ModeSwitcher (#84e)`
- `UX: Objection, keyboard shortcut for selected-text capture (#84f)`
- `UX: Objection, auto-focus + competitor pre-fill on capture (#84g)`

**Combined effort:** ~1¾ days. Stacked on the composer work in #84a/b/c.

---

## Part 3: Cross-cutting themes (deferred but worth naming)

These don't belong to one workflow but touch all of them.

### CT1. Density vs breathing at 360px

The sidebar's default width is dense. Mid-call legibility (one-handed, glanceable) suggests typography should go up a notch on **Copilot** and **Objection** surfaces specifically. Suggested: a `data-mode="live"` attribute set when in Copilot tab + when ObjectionPanel has a fresh capture, bumping body text 12 → 13 and increasing line-height. Not a token-system change, just a CSS pass keyed on the attribute. **~½ day.** File as `UX: live-mode typography bump for mid-call surfaces`.

### CT2. Ship the unshipped #87 skin convergence

The audit reco (drop `linear`, converge `live` base) is mechanical and adds zero behavior risk. Two sub-issues already in `87-skin-consistency.md`. **~1 day total.** No reason to keep deferring.

### CT3. IA decision: should the tab strip be 4 tabs or 3?

If Objection moves out of Generate (Change 3.1) and Email stays under Generate (W5 doesn't justify its own tab), the tab strip stays at 4: Generate / Knowledge / Copilot / Insights. This is the right shape, verified. No change.

But: **Copilot should be the default tab on cold-start when sample data is loaded** (Change 2.1) rather than Generate. The current default-to-Generate is a vestige of the pre-Copilot product.

### CT4. Settings ↔ Quick Settings link

Add a "Open full settings →" link at the bottom of the Quick Settings popover that opens the passcode-gated panel. Today they feel disconnected. **~¼ day.** File as `UX: Quick Settings, link to full settings panel`.

### CT5. Email council mid-task simplification (W5)

Apply the same response-side pattern from #111 (single composer + inline citations) to the email council's 4-agent result. This is a follow-on to #84b, defer until after that lands, then file `UX: Email composer, apply inline-citation pattern from #84b`. ~1 day.

---

## Part 4: Priority queue + suggested order

If we can ship 1–2 sub-issues per week:

**Week 1: first-install conversion (highest one-time leverage):**
- `#86b` First-install auto-load sample + Copilot default
- `#86c` Welcome banner

**Week 2: mid-call copilot per-call leverage:**
- `#79b` Collapse meeting context + agenda
- `#79c` URL lookup auto-fire on paste
- `#79d` Auto-end on tab close

**Week 3: objection capture (depends on #84a from PR #111 landing):**
- `#84e` Remove objection from ModeSwitcher
- `#84f` Keyboard shortcut
- `#84g` Auto-focus on capture

**Week 4: cleanup + cross-cutting:**
- `#87a/b` Skin convergence (drop linear, converge live)
- `#86d` Onboarding checklist to bottom drawer
- `#79e` Recent-calls chip carry-forward

**Deferred / file as backlog:**
- CT1 typography bump (live surfaces)
- CT4 Quick Settings → full Settings link
- CT5 email composer inline citations (after #84b)
- W6 insights search/filter, trend over time

## Out of scope (explicit)

- Backend / agent pipeline changes: orchestrator, council shape, prompt rewrites beyond #84a's `[N]` markers.
- Landing page (separate property).
- Mobile / non-Chrome surfaces.
- Pricing / billing UI.
- The `validation` agent for objection (deferred indefinitely).

## Acceptance for this audit

- [x] Doc committed at `docs/ux/workflow-audit.md`.
- [ ] Avinash ratifies the priority queue (Week 1–4) or reorders.
- [ ] Sub-issues filed per ratified priority (in batches, not all at once).

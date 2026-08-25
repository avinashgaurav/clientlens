# #83: Inline Generate Preview into Form (investigation)

**Status:** investigation, no code change yet. Decision needed before implementation.

## TL;DR

Killing the Preview step entirely (Option A from the issue) is **wrong**, Preview today is the brand-asset editor, not a vestigial confirmation. The reasonable paths are:

- **Option B**: Collapse Preview into Form: render the brand-assets block inline at the bottom of `PersonalizationForm`, submit goes straight to Generating.
- **Option C** (new, not in the issue), Smart skip: only show Preview when auto-fetch returns a placeholder logo. Happy path skips Preview; slow path keeps it for human correction.

Recommendation: **Option C** for the most ergonomic happy path. Option B is acceptable if simplicity matters more than per-call clicks.

## What Preview actually does today

`extension/src/sidebar/components/AssetPreview.tsx` is named "Preview" but it is the **brand-asset editor**. Concrete responsibilities:

| Responsibility | Lines | Notes |
|---|---|---|
| Render the auto-fetched logo (placeholder badge if fetch failed) | 80–108 | `isPlaceholder = brandAssets.logo_source === "placeholder"` |
| Upload a logo file | 36–51 | FileReader → `buildUploadedAssets` |
| Override the domain and refetch | 18–34, 114–121 | Useful for `acme.co.in` vs `acme.com` mismatches |
| Render and tweak the auto-extracted accent color | 53–57, 147–171 | Sampled from logo via Vibrant lib |
| Submit guard: button disabled if no `logo_url` | 175 | Prevents broken-decks from auto-fetch fails |
| "Back to form" link | 65–70 | Lets rep edit ICP without re-entering |

`PersonalizationForm` already calls `fetchBrandAssets` on submit before transitioning to Preview (lines 116–118). So Preview's only job is human review + correction of the fetch result.

## Why Option A (kill Preview) is wrong

If we remove Preview, the rep loses:
- The chance to fix a placeholder logo before generation
- Domain override (`acme.co.in` rescues from `acme.com` 404s)
- Accent color tweak

Auto-fetch failure rate isn't tiny: `logo_source === "placeholder"` is hit whenever Clearbit-style lookup misses (small Indian/EU companies, non-`.com` TLDs, brand-new sites). Killing Preview means those reps either generate a logo-less deck or kill the run mid-Generating.

## Option B: collapse into Form

Rendered shape:

```
┌─ PersonalizationForm ──────────────────────────┐
│ Company name: [____________]                   │
│ ICP role:     [____________]                   │
│ Deal size:    [____________]                   │
│ ... other fields ...                           │
│                                                │
│ ─── Brand assets (auto-fetched after typing) ──│
│ Logo: [thumb]  Source: clearbit                │
│  Upload logo │ Refetch │ Domain override       │
│ Color: [picker] #0891b2                        │
│                                                │
│ [ Generate ]  (disabled until logo present)    │
└────────────────────────────────────────────────┘
```

Mechanics:
- Form auto-fetches brand assets when `company_name` blurs (or on a 500ms debounce).
- Bottom of Form renders the AssetPreview JSX block inline (refactor `AssetPreview` into a child component).
- `flowStep === "preview"` removed from the state machine entirely.
- Submit transitions Form → Generating directly.

Pros:
- One fewer step. Repeat users (the daily-driver audience) save a click per call.
- `flowStep` enum simplifies: `"form" | "generating" | "result"`.
- Mental model: "the form has all the inputs; submit means I'm done."

Cons:
- Long form on small viewports: sidebar at 360px width gets dense.
- Auto-fetch on blur is non-obvious; reps may type → wait → wonder what's happening.
- The `isPlaceholder` warning needs to be inline + dismissable so it doesn't block submit when the rep accepts the placeholder.

Estimated work: 1 day. Touches `PersonalizationForm.tsx` (inline the asset block), `App.tsx` (remove preview-step routing), `AssetPreview.tsx` (becomes `BrandAssetsBlock.tsx` or similar), `app-store.ts` (drop `"preview"` from `FlowStep`), `useCouncil.ts` (no changes, already triggers off `flowStep === "generating"`).

## Option C: smart skip

Keep `AssetPreview` as a component, but only route to it when auto-fetch returned a placeholder. Happy path goes Form → Generating; placeholder path goes Form → Preview → Generating.

Mechanics:
- After `fetchBrandAssets` resolves in Form's submit handler, check `assets.logo_source`.
- If `"placeholder"`: `setFlowStep("preview")` (existing behavior).
- Else: `setFlowStep("generating")` directly.
- Add a "Tweak brand assets" link on the Generating screen → drops back to Preview if the rep changes their mind mid-run (optional, low priority).

Pros:
- Happy path is one click shorter.
- Slow path still gets the full editor: no regression in failure recovery.
- `flowStep` machine unchanged.
- Smallest diff of the three options.

Cons:
- Slightly magical: rep doesn't know whether they'll see Preview or not.
- The "Tweak brand assets" escape hatch from Generating is new UI surface (skip if not building it now).

Estimated work: 0.5 day. Touches `PersonalizationForm.tsx` only, add the conditional `setFlowStep` after `fetchBrandAssets` resolves.

## Recommendation

**Option C.** Smallest diff, no regression, biggest happy-path win. The "magic" concern is real but mitigated by the existing back button on Preview, reps who want to see brand assets always can hit Back from Generating (already exists).

Option B is the runner-up if you want to simplify the `flowStep` machine permanently. Pick B if there's a separate desire to slim the state enum.

Option A is off the table.

## Acceptance for the implementation PR (whichever option lands)

- [ ] Happy-path Generate from Form → first agent call within 1 click of submit (Option B / C) or 0 clicks if Option C and auto-fetch succeeds.
- [ ] Placeholder logo case still shows the upload/refetch/color editor before Generating.
- [ ] No new TypeScript errors; existing `flowStep`-driven CouncilRunner effect still fires correctly (touched in #82 with the `outputMode === "pitch"` guard).
- [ ] No regression in `AssetPreview`'s "Back to form" behavior (if Option B / C keeps the editor accessible).

## Out of scope
- Redesigning the Form fields themselves (separate issue if needed).
- Changing the Result panel.
- Changing the brand-asset fetch service.
- Auto-saving Form drafts (file separately).

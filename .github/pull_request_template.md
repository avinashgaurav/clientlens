## What this changes

<!-- One or two sentences. If this closes an issue, write "Closes #NN". -->

## Why

<!-- The problem it solves. Skip if the issue already covers it. -->

## How it was tested

<!--
Much of this codebase is Chrome extension surface that no test harness covers:
side panel, offscreen audio capture, content scripts, the Meet transponder.
Say what you exercised by hand. "Ran a real Meet call, transponder rendered,
sentiment updated" is worth more than a green type-check.
-->

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes (production bundle, fails on unresolved manifest placeholders)
- [ ] `bash scripts/lint-manifest.sh` reports clean
- [ ] Manually exercised the surface I changed, in Chrome

## Risk checks

Tick only what applies, and explain in a line each.

- [ ] **Touches `chrome.storage` keys.** Those are persistence identifiers. Explain the migration, or why none is needed.
- [ ] **Touches `manifest.json` permissions or `host_permissions`.** Explain why the new access is required.
- [ ] **Touches auth, RBAC, or OAuth token handling.**
- [ ] **Changes where transcripts, audio, or KB content are sent.**
- [ ] **Changes LLM prompt or agent contracts.** Note whether output shape changed for callers.
- [ ] None of the above.

## Screenshots

<!-- For any UI change, before and after. Sidebar screenshots are fine. -->

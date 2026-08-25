# Skin fidelity audit: tokens.css vs design-md sources

**Status:** reference doc. Captures how faithfully each of the 6 surface skins matches its source `DESIGN.md` in the awesome-design-md corpus (the `awesome-design-md` corpus, one directory per brand).

**Method:** read all 6 source `DESIGN.md` files, extracted concrete specs (hex values, type scale, signature moves), compared token-by-token against `extension/src/sidebar/tokens.css`.

## The persistent intentional deviation

Every skin overrides its source brand's native accent with **Wingman orange `#F58549`** as the CTA / brand mark. This is a deliberate product decision from PR #40, the orange is the one thread that ties all 6 surfaces back to Wingman. It is NOT a fidelity bug. Each source brand's native accent is still present in the skin as a non-CTA token (e.g. PostHog's `#f7a501` lives as `--accent-yellow`, Linear's lavender as `--accent-blue`).

## Per-skin color fidelity

### PostHog → `brand` (Generate / Knowledge / sidebar chrome)
Source canvas `#eeefe9`, ladder `e5e7e0 / ffffff / fcfcfa / 23251d`, ink `23251d / 4d4f46 / 6c6e63`, pastel callouts (blue `#dceaf6`, green `#d9eddf`, red `#f7d6d3`, purple `#e7d8ee`).
**Current:** matches exactly except `--ink-4` darkened `#6C6E63 → #6A6C61` for WCAG AA-small (eyebrow text at 11px). Pastel callouts all present. **Fidelity: HIGH.**

### Cursor → `live` (Live Meeting Copilot)
Source canvas `#f7f7f4`, ladder `fafaf7 / ffffff / e6e5e0`, ink `26251e / 5a5852 / 807d72`, timeline pastels (thinking `#dfa88f`, grep `#9fc9a2`, read `#9fbbe0`, edit `#c0a8dd`, done `#c08532`).
**Current:** surfaces + ink match; the 5 timeline pastels are **byte-exact**. `--ink-4` darkened `#807D72 → #6A685E` for WCAG. **Fidelity: HIGH.**
**Type gap:** Cursor's display type is **weight 400, magazine voice, never bold** (CursorGothic). Not yet applied to live-panel headings.

### Spotify → `insights` (Post-call Insights)
Source canvas `#121212`, ladder `181818 / 1f1f1f / 252525`, ink `white / b3b3b3 / cbcbcb`, green `#1ed760`, heavy shadow `rgba(0,0,0,0.5) 0px 8px 24px`.
**Current:** every value matches, including the signature heavy shadow. **Fidelity: NEAR-EXACT.**

### Linear → `linear` (Popup)
Source canvas `#010102`, 4-step ladder `0f1011 / 141516 / 18191a / 191a1b`, ink `f7f8f8 / d0d6e0 / 8a8f98 / 62666d`, lavender `#5e6ad2`, hairlines `23252a / 34343a / 3e3e44`.
**Current:** every value matches. **Fidelity: NEAR-EXACT.**
**Type gap:** Linear's signature is **aggressive negative display tracking** (−3px @ 80px = −0.0375em). Not applied.

### Vercel → `vercel` (In-Meet transponder)
Source canvas `#ffffff`, soft `fafafa / f5f5f5`, ink `171717 / 4d4d4d / 888888`, link `#0070f3`, mesh gradient (develop `#007cf0→#00dfd8`, preview `#7928ca→#ff0080`, ship `#ff4d4d→#f9cb28`).
**Current:** surfaces + ink + link + full mesh palette match exactly. `--ink-4` darkened `#888888 → #737373` for WCAG. **Fidelity: HIGH.**
**Type gap:** Geist negative tracking (−2.4px @ 48px = −0.05em) not applied. Transponder is content-light so impact is low.

### SpaceX → `spacex` (Landing hero)
Source canvas `#000000`, soft `#0a0a0a`, ink `white / f0f0fa`, **no accent** (black/white/photography only), D-DIN-Bold uppercase display with **positive tracking +1.6px @ 80px = +0.02em**, **single ghost-outlined pill CTA per band (never filled)**.
**Current:** black canvas + ink match. **Fidelity: HIGH on color, MEDIUM on treatment.**
**Type gap:** landing hero uses mixed-case sans + a filled orange CTA. SpaceX signature is uppercase + positive tracking + ghost CTA. (D-DIN isn't a Google Font; we substitute the existing display family uppercased with the positive tracking applied.)

## Summary

- **Color tokens: faithful across all 6.** The only real divergence was the reverted #96/#97 (which flattened Linear + Cursor); both are restored.
- **Type + signature moves** are the remaining opportunity. `tokens.css` is color-only, so type signatures (negative/positive tracking, weight rules) need new tokens + component application.

## Tracking values (em-relative, derived from DESIGN.md px-at-size)

| Brand | DESIGN.md spec | em-relative |
|---|---|---|
| Linear | −3.0px @ 80px | −0.0375em |
| Vercel | −2.4px @ 48px | −0.05em |
| SpaceX | +1.6px @ 80px | +0.02em |
| Cursor | −2.16px @ 72px | −0.03em |
| PostHog | −0.6px @ 24px | −0.025em |

These are encoded as `--display-tracking` per skin (see tokens.css). Cursor additionally sets `--display-weight: 400`.

/**
 * Reads the objection-composer v2 flag (#84c).
 *
 * Resolution order:
 *   1. `?composer=v1` URL param → returns `false` (force legacy for this
 *      session, doesn't mutate storage). For live debugging.
 *   2. `?composer=v2` URL param → returns `true` (force v2 for this
 *      session). Mirror path for forcing v2 when storage says v1.
 *   3. `chrome.storage.local["clientlens_objection_composer_v2"]` →
 *      explicit boolean wins.
 *   4. Default → `true`. v2 IS the canonical experience.
 *
 * Storage is read once on mount. If a support flip happens mid-session
 * via chrome.storage.set({…}), the hook re-renders via the storage
 * onChanged listener.
 *
 * Removal criteria (per design doc): after 14 days from rollout, if
 * telemetry shows copy-rate ≥ baseline + disclosure open-rate > 0 +
 * zero parse-fallback events in p99 → delete the legacy renderer + this
 * hook + the flag in a single commit.
 */

import { useEffect, useState } from "react";

export const OBJECTION_COMPOSER_V2_KEY = "clientlens_objection_composer_v2";

// NOTE: Chrome side panels may NOT preserve query params across panel
// re-opens. `chrome.sidePanel.open()` opens the configured `default_path`
// from manifest.json, which is fixed: query params baked into the URL at
// first open will be lost on a subsequent open. So `?composer=v1` works
// reliably ONLY for the duration of a single panel lifetime. For sticky
// overrides, use `chrome.storage.local.set` instead.
function readUrlOverride(): boolean | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("composer");
    if (v === "v1") return false;
    if (v === "v2") return true;
  } catch {
    /* SSR / no window: fall through */
  }
  return null;
}

/**
 * Returns the live composer-v2 flag value.
 *
 * Hook RULES: call from a top-level component (e.g. ObjectionPanel root),
 * NOT inside a conditional branch. The hook always runs the same number
 * of hook calls per render.
 */
export function useObjectionComposerV2(): boolean {
  // URL param resolves synchronously; safe in useState init.
  const urlOverride = readUrlOverride();

  const [storageValue, setStorageValue] = useState<boolean | null>(null);

  useEffect(() => {
    if (urlOverride !== null) return; // URL wins; skip storage subscribe

    let cancelled = false;
    try {
      chrome.storage?.local?.get?.(OBJECTION_COMPOSER_V2_KEY, (data) => {
        if (cancelled) return;
        const v = data?.[OBJECTION_COMPOSER_V2_KEY];
        setStorageValue(typeof v === "boolean" ? v : null);
      });
    } catch {
      /* non-extension env */
    }

    // Listen for support flips mid-session so the panel re-renders.
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      if (!(OBJECTION_COMPOSER_V2_KEY in changes)) return;
      const nv = changes[OBJECTION_COMPOSER_V2_KEY]?.newValue;
      setStorageValue(typeof nv === "boolean" ? nv : null);
    };
    try {
      chrome.storage?.onChanged?.addListener(onChanged);
    } catch {
      /* noop */
    }
    return () => {
      cancelled = true;
      try {
        chrome.storage?.onChanged?.removeListener(onChanged);
      } catch {
        /* noop */
      }
    };
  }, [urlOverride]);

  if (urlOverride !== null) return urlOverride;
  if (storageValue !== null) return storageValue;
  return true; // default: v2 is canonical
}

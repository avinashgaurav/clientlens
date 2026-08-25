import React, { useEffect, useState } from "react";
import { X, Info } from "lucide-react";
import {
  subscribeCallHistoryChanges,
} from "../../shared/utils/call-history-storage";

/**
 * #95: persistent banner shown on every tab when sample data is loaded
 * via the Settings toggle. Dismissable per browser session
 * (sessionStorage) so the rep can hide it for the session without
 * losing the reminder on the next sidebar open while samples are still
 * loaded.
 *
 * Detects sample data via the public hasSampleDataLoaded() API; refreshes
 * on:
 *   - mount
 *   - tab visibility change (catches Settings-toggle changes when the
 *     panel was opened in a different sidebar lifetime)
 *   - call-history change events (covers the rep loading samples from
 *     either KB or Copilot empty-state CTAs)
 *
 * Also subscribes to the KB chrome.storage.local key so loading samples
 * via the KB empty-state CTA refreshes the banner too.
 */

const DISMISS_KEY = "wingman_sample_banner_dismissed_session";

export function SampleDataBanner() {
  const [hasDemo, setHasDemo] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // A single loadSampleData() write fires the call-history change event
  // plus 5 chrome.storage.onChanged events (one per KB entry). All 9 land
  // in the same React render batch via setHasDemo(true), so the redundant
  // refresh()es are deduped at commit time. If hasSampleDataLoaded ever
  // grows an async network call, debounce this effect (e.g. with a 50ms
  // trailing edge): today it's pure localStorage reads, so unguarded.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const m = await import("../../shared/utils/sample-data");
      try {
        const loaded = await m.hasSampleDataLoaded();
        if (!cancelled) setHasDemo(loaded);
      } catch {
        if (!cancelled) setHasDemo(false);
      }
    }
    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribeCallHistory = subscribeCallHistoryChanges(() => void refresh());

    // KB writes flow through chrome.storage.local; listen so the banner
    // appears when samples are loaded via the KB empty-state CTA.
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && "clientlens_kb" in changes) void refresh();
    };
    try {
      chrome.storage?.onChanged?.addListener(onStorageChanged);
    } catch {
      /* non-extension env */
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeCallHistory();
      try {
        chrome.storage?.onChanged?.removeListener(onStorageChanged);
      } catch {
        /* noop */
      }
    };
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!hasDemo || dismissed) return null;

  return (
    <div
      className="flex items-start gap-2 px-3 py-2"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--signal-warn)",
        borderRadius: 4,
      }}
      role="status"
    >
      <Info size={12} className="shrink-0 mt-0.5" style={{ color: "var(--signal-warn)" }} />
      <p className="flex-1 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
        <span className="font-semibold" style={{ color: "var(--ink)" }}>Demo data loaded.</span>{" "}
        Clear from Settings when you're ready to use real data.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
        className="shrink-0 p-0.5 hover:opacity-80"
        style={{ color: "var(--ink-4)", background: "transparent", border: "none" }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

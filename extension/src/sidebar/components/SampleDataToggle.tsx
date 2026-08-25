import React, { useEffect, useState } from "react";

/**
 * Unprivileged sample-data toggle (#95). Loading/clearing demo data
 * doesn't require the admin passcode, it's reversible by design and the
 * data is prefix-tagged so cleanup is atomic. Renders just the card; the
 * caller controls outer padding (used in both SettingsPanel and the
 * Quick Settings popover).
 */
export function SampleDataToggle() {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const m = await import("../../shared/utils/sample-data");
        const v = await m.hasSampleDataLoaded();
        if (!cancelled) setLoaded(v);
      } catch {
        if (!cancelled) setLoaded(false);
      }
    }
    void refresh();
    // Sync with samples loaded via the KB / Copilot empty-state CTAs so the
    // toggle never desyncs (a stale "off" would trigger a duplicate load).
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && "clientlens_kb" in changes) void refresh();
    };
    const onSameTab = () => void refresh();
    try { chrome.storage?.onChanged?.addListener(onStorageChanged); } catch { /* noop */ }
    window.addEventListener("wingman:call-history-changed", onSameTab);
    return () => {
      cancelled = true;
      try { chrome.storage?.onChanged?.removeListener(onStorageChanged); } catch { /* noop */ }
      window.removeEventListener("wingman:call-history-changed", onSameTab);
    };
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      const m = await import("../../shared/utils/sample-data");
      if (loaded) {
        await m.clearSampleData();
      } else {
        await m.loadSampleData();
      }
      // Re-read actual storage rather than optimistically flipping, if the
      // load/clear threw mid-write, state stays truthful to disk.
      setLoaded(await m.hasSampleDataLoaded());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 p-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 6,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-ink">
          Try Wingman with sample data
        </div>
        <div className="text-[11px] text-ink-4 mt-0.5 leading-snug">
          Loads 5 sample KB entries and 4 sample call records. Toggle
          off to remove them: real data is untouched.
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={loaded}
        aria-label="Toggle sample data"
        className="shrink-0 disabled:opacity-50"
        style={{
          width: 36, height: 20,
          background: loaded ? "var(--brand-orange)" : "var(--line)",
          borderRadius: 9999,
          position: "relative",
          transition: "background-color 140ms ease",
          border: "none",
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: loaded ? 18 : 2,
            width: 16, height: 16,
            background: "#FFFFFF",
            borderRadius: "50%",
            transition: "left 140ms ease",
          }}
        />
      </button>
    </div>
  );
}

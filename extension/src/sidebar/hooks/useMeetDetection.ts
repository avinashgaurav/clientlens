import { useEffect, useState } from "react";

/**
 * Polls chrome.tabs for any open Google Meet tab in the current window.
 *
 * Returns `true` when at least one tab with URL matching
 * `https://meet.google.com/*` exists. Re-checks on:
 *   - mount
 *   - tab visibility change (the sidebar tab becoming visible)
 *   - chrome.tabs.onUpdated / onRemoved (Meet tab opens or closes)
 *
 * In contexts where chrome.tabs is unavailable (web preview, content script
 * sandbox, restricted mode), the hook returns `false` without throwing.
 */
export function useMeetDetection(): boolean {
  const [hasMeetTab, setHasMeetTab] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      try {
        if (!chrome?.tabs?.query) return;
        chrome.tabs
          .query({ url: "https://meet.google.com/*" })
          .then((tabs) => {
            if (cancelled) return;
            setHasMeetTab(Array.isArray(tabs) && tabs.length > 0);
          })
          .catch(() => {
            if (cancelled) return;
            setHasMeetTab(false);
          });
      } catch {
        /* chrome.tabs missing entirely (extension not loaded) */
      }
    }

    refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // chrome.tabs.onUpdated fires on every URL change; refresh on completed loads
    // only, otherwise we'd thrash setState during user typing in the address bar.
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (changeInfo.status === "complete" || changeInfo.url) refresh();
    };
    const onRemoved = () => refresh();

    try {
      chrome?.tabs?.onUpdated?.addListener?.(onUpdated);
      chrome?.tabs?.onRemoved?.addListener?.(onRemoved);
    } catch {
      /* listeners unavailable */
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        chrome?.tabs?.onUpdated?.removeListener?.(onUpdated);
        chrome?.tabs?.onRemoved?.removeListener?.(onRemoved);
      } catch {
        /* ignore */
      }
    };
  }, []);

  return hasMeetTab;
}

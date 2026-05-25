import { useEffect, useState } from "react";
import {
  listCallRecords,
  pruneExpiredCallRecords,
  subscribeCallHistoryChanges,
  type StoredCallRecord,
} from "../../shared/utils/call-history-storage";

/**
 * Subscribes to the local call-history store. Reads synchronously on first
 * render (localStorage access is sync), then refreshes on:
 *   - same-tab writes (saveCallRecord / clearCallHistory dispatch a custom event)
 *   - cross-tab writes (window storage event)
 *   - tab visibility change (covers a long pause where the 30d retention
 *     sweep on next read might prune entries)
 */
export function useCallHistory(): { records: StoredCallRecord[]; empty: boolean } {
  const [records, setRecords] = useState<StoredCallRecord[]>(() => listCallRecords());

  useEffect(() => {
    // refresh is closed over once at mount; the empty-deps array is correct
    // because setRecords is stable and the imported functions are module
    // level. Don't add deps without re-thinking the subscribe lifecycle.
    const refresh = () => setRecords(listCallRecords());

    const unsubscribe = subscribeCallHistoryChanges(refresh);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        pruneExpiredCallRecords();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Mount: sweep expired entries off disk and pull fresh state.
    pruneExpiredCallRecords();
    refresh();

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { records, empty: records.length === 0 };
}

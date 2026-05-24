// Bundle-time feature flags exposed via Vite env vars. Default: off.
// Add one helper per flag — keeps callsites obvious and grep-able.

export function isInsightsPanelEnabled(): boolean {
  // The Insights tab currently renders mock call history. It's gated until
  // the post-call summary persistence layer lands and the panel can show
  // real data. Set VITE_ENABLE_INSIGHTS=true to preview the surface.
  const raw = import.meta.env.VITE_ENABLE_INSIGHTS;
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

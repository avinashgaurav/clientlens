import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Sparkles, X, ChevronDown } from "lucide-react";
import { getSettings } from "../../shared/utils/settings-storage";

interface Props {
  kbCount: number;
  onOpenSettings: () => void;
}

const DISMISS_KEY = "clientlens_onboarding_dismissed_v1";

export function OnboardingChecklist({ kbCount, onOpenSettings }: Props) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  // When the rep collapses the completed pill, this stays false. The pill
  // itself toggles back to the full card on click. Local state because the
  // expansion is a UI affordance, not a setting worth persisting.
  const [pillExpanded, setPillExpanded] = useState(false);

  const steps = useMemo(() => {
    const s = getSettings();
    const keyOk =
      !!s.geminiKey ||
      !!s.anthropicKey ||
      !!s.groqKey ||
      (!!s.customBaseUrl && !!s.customModel);
    const anyIntegration = Object.values(s.integrations).some((c) => c.connected);
    const hasKB = kbCount > 0;
    return [
      { id: "key", label: "Add a model API key", done: keyOk, action: onOpenSettings },
      { id: "integ", label: "Connect one integration (optional)", done: anyIntegration, action: onOpenSettings },
      { id: "kb", label: "Add at least one KB entry", done: hasKB },
    ];
  }, [kbCount, onOpenSettings]);

  const remaining = steps.filter((s) => !s.done).length;
  const allDone = remaining === 0;

  // If a previously-complete state regresses (e.g. KB wiped, key removed), the
  // checklist should reappear: clear the dismissal so the rep sees what's
  // pending again.
  useEffect(() => {
    if (!allDone && dismissed) {
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setDismissed(false);
    }
  }, [allDone, dismissed]);

  // Hide entirely only when there's pending work AND the rep explicitly
  // dismissed it. The complete-state pill is always visible (and small).
  if (!allDone && dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  // Compact pill: everything's done. Click expands to show what was checked.
  if (allDone && !pillExpanded) {
    return (
      <button
        type="button"
        onClick={() => setPillExpanded(true)}
        aria-label="All set up: click to view checklist"
        className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold border border-green/40 bg-green/5 text-green hover:bg-green/10"
        style={{ borderRadius: 9999 }}
      >
        <CheckCircle2 size={12} />
        Set up
        <ChevronDown size={10} className="opacity-70" />
      </button>
    );
  }

  return (
    <div
      className={`border p-3 relative ${
        allDone ? "border-green/40 bg-green/5" : "border-orange/40 bg-orange/5"
      }`}
    >
      <button
        onClick={allDone ? () => setPillExpanded(false) : dismiss}
        aria-label={allDone ? "Collapse" : "Dismiss"}
        className="absolute top-2 right-2 p-1 text-ink-4 hover:text-ink"
      >
        <X size={12} />
      </button>
      <div className="flex items-center gap-1.5 mb-2">
        {allDone ? (
          <CheckCircle2 size={12} className="text-green" />
        ) : (
          <Sparkles size={12} className="text-orange" />
        )}
        <span className="text-[11px] font-semibold text-ink">
          {allDone ? "You're set up" : "Get set up"}
        </span>
        <span className="text-[10px] font-mono text-ink-4 ml-auto mr-4">
          {steps.length - remaining} / {steps.length}
        </span>
      </div>
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[11px]">
            {s.done ? (
              <CheckCircle2 size={12} className="text-green shrink-0" />
            ) : (
              <Circle size={12} className="text-ink-4 shrink-0" />
            )}
            <span className={s.done ? "text-ink-3 line-through" : "text-ink"}>{s.label}</span>
            {!s.done && s.action && (
              <button
                onClick={s.action}
                className="ml-auto text-[10px] font-mono uppercase tracking-[0.14em] text-orange hover:underline"
              >
                Open
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

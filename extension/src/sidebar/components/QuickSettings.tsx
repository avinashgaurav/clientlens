import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { ProviderChip } from "./ProviderChip";
import { ModelPicker } from "./ModelPicker";
import { SampleDataToggle } from "./SampleDataToggle";

/**
 * Quick Settings popover (#88). A single, passcode-free home for the
 * settings reps change often, which were previously scattered: provider
 * (Copilot header), model (header), Deep Research (Generate form),
 * sample data (buried in passcode-gated Settings). The inline shortcuts
 * stay where they are; this is the canonical "where do I change X?" place.
 *
 * Editing API keys / integrations stays behind the passcode in the full
 * Settings panel: only these low-stakes, reversible toggles live here.
 *
 * (Mock mode intentionally omitted: VITE_MOCK_MODE isn't wired to the live
 * generation path, so a toggle would be a no-op. Tracked separately.)
 */
export function QuickSettings() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deepResearchEnabled = useAppStore((s) => s.deepResearchEnabled);
  const setDeepResearchEnabled = useAppStore((s) => s.setDeepResearchEnabled);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="p-1.5 transition-colors"
        style={{
          color: hover || open ? "var(--brand-orange)" : "var(--ink-4)",
          background: hover || open ? "var(--surface-2)" : "transparent",
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Quick settings"
        aria-label="Quick settings"
      >
        <SlidersHorizontal size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Quick settings"
          // Defensive: keep the outside-click handler from ever firing on a
          // mousedown that originated inside the popover. The nested
          // Provider/Model dropdowns collapse their option rows on click,
          // which can detach the clicked node before later handlers run;
          // stopping mousedown propagation here makes "close only on a
          // genuinely-outside click" robust regardless of inner-component
          // event timing.
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 300,
            maxWidth: "calc(100vw - 24px)",
            background: "var(--surface-1)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "var(--shadow-2)",
            zIndex: 60,
            padding: 12,
          }}
        >
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 10 }}>
            Quick settings
          </div>

          {/* Provider + model: reuse the existing controls */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>Provider</span>
            <ProviderChip />
          </div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>Model</span>
            <ModelPicker />
          </div>

          {/* Deep research toggle (store-backed) */}
          <button
            type="button"
            onClick={() => setDeepResearchEnabled(!deepResearchEnabled)}
            role="switch"
            aria-checked={deepResearchEnabled}
            aria-label="Deep research"
            className="w-full flex items-center justify-between gap-3 p-3 mb-2"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold" style={{ color: "var(--ink)" }}>
                Deep research
              </span>
              <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: "var(--ink-4)" }}>
                Pulls extra context before drafting. Slower, richer pitches.
              </span>
            </span>
            <span
              className="shrink-0"
              style={{
                width: 36, height: 20,
                background: deepResearchEnabled ? "var(--brand-orange)" : "var(--line)",
                borderRadius: 9999,
                position: "relative",
                transition: "background-color 140ms ease",
                display: "inline-block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: deepResearchEnabled ? 18 : 2,
                  width: 16, height: 16,
                  background: "#FFFFFF",
                  borderRadius: "50%",
                  transition: "left 140ms ease",
                }}
              />
            </span>
          </button>

          {/* Sample data toggle (shared component) */}
          <SampleDataToggle />
        </div>
      )}
    </div>
  );
}

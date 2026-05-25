import React from "react";
import { FileText, Shield, Mail } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import type { OutputMode } from "../../shared/types";

// PostHog-style pill toggle: rest = transparent text, active = ink fill with
// inverted text. Sits flush in a hairline-bordered group on the cream canvas.
const MODES: { id: OutputMode; label: string; icon: React.ReactNode }[] = [
  { id: "pitch", label: "Pitch", icon: <FileText size={12} /> },
  { id: "email", label: "Email", icon: <Mail size={12} /> },
  { id: "objection", label: "Objection", icon: <Shield size={12} /> },
];

export function ModeSwitcher() {
  const { outputMode, setOutputMode } = useAppStore();
  return (
    <div
      className="flex gap-1 p-1"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: 6,
      }}
    >
      {MODES.map((m) => {
        const active = outputMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setOutputMode(m.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: active ? "var(--brand-orange)" : "transparent",
              color: active ? "#0A0A0A" : "var(--ink-3)",
              borderRadius: 4,
            }}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

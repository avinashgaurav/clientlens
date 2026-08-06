import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { UsageMeter } from "./UsageMeter";
import { AdminGate } from "./AdminGate";
import { QuickSettings } from "./QuickSettings";
import { isAdminUnlocked } from "../../shared/utils/settings-storage";

interface OpenEventDetail {
  source?: string;
}

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);

  function requestOpenSettings() {
    if (isAdminUnlocked()) {
      setSettingsOpen(true);
    } else {
      setGateOpen(true);
    }
  }

  useEffect(() => {
    function openFromElsewhere(e: Event) {
      const detail = (e as CustomEvent<OpenEventDetail>).detail;
      void detail;
      requestOpenSettings();
    }
    window.addEventListener("clientlens:open-settings", openFromElsewhere);
    return () => window.removeEventListener("clientlens:open-settings", openFromElsewhere);
  }, []);

  return (
    <>
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="flex items-center gap-2">
          {/* Brand mark: the shipped icon itself, so the header can never drift
              out of sync with the toolbar icon the way the old "PW" text did.
              Persists across every skin. */}
          <img
            src="icons/icon128.png"
            alt="Project Wingman"
            className="w-7 h-7"
            style={{ borderRadius: 6, display: "block", flexShrink: 0 }}
          />
          <div className="flex flex-col leading-none">
            <span
              className="font-bold"
              style={{
                color: "var(--ink)",
                fontSize: 14,
                letterSpacing: "-0.03em",
              }}
            >
              Project Wingman
            </span>
            <span className="eyebrow mt-1" style={{ fontSize: 9 }}>
              Sales Copilot
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <UsageMeter />
          {/* #88: Quick Settings popover — canonical home for the
              passcode-free controls (provider / model / deep research /
              sample data). The full gear stays passcode-gated for keys. */}
          <QuickSettings />
          <button
            onClick={requestOpenSettings}
            onMouseEnter={() => setSettingsHover(true)}
            onMouseLeave={() => setSettingsHover(false)}
            className="p-1.5 transition-colors"
            style={{
              color: settingsHover ? "var(--brand-orange)" : "var(--ink-4)",
              background: settingsHover ? "var(--surface-2)" : "transparent",
            }}
            title="Settings — admin passcode required"
            aria-label="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      <AdminGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onUnlock={() => { setGateOpen(false); setSettingsOpen(true); }}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export function openSettings() {
  window.dispatchEvent(new CustomEvent("clientlens:open-settings"));
}

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getSettings, saveSettings, STORAGE_KEY as SETTINGS_KEY } from "../../shared/utils/settings-storage";
import { resolveLLMConfig, type LLMProvider } from "../../shared/agents/llm-client";

/**
 * Mid-call LLM provider switch (#82).
 *
 * Compact chip that lets the rep pivot to a different configured provider
 * without leaving the Copilot view. The full Settings panel stays
 * passcode-gated for *editing* keys; switching among already-configured
 * providers is unprivileged.
 *
 * "Configured" rules:
 *   - anthropic / gemini / groq / openrouter: always available (backend-
 *     proxied per #1 — the extension never holds the keys for these).
 *   - ollama: surfaced only when VITE_OLLAMA_BASE_URL is set at build time.
 *     Treating this as a dev-only path; not listed by default.
 *   - custom: only available when settings.customBaseUrl AND
 *     settings.customModel are set.
 *
 * If only one provider is configured, the chip renders as a read-only label
 * (no dropdown) so it isn't a useless interaction target mid-call.
 */

interface ProviderOption {
  id: LLMProvider;
  label: string;
}

const ALL_OPTIONS: ProviderOption[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "groq", label: "Groq" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Custom" },
];

function availableProviders(): ProviderOption[] {
  return ALL_OPTIONS.filter((opt) => {
    // resolveLLMConfig is the single source of truth for "can I make a call
    // with this provider?" — it knows about both extension-side keys (custom)
    // and backend-proxied providers' configuration requirements. Filter via
    // it so the chip only lists providers that won't immediately error.
    const result = resolveLLMConfig({ provider: opt.id, model: "" });
    return !("error" in result);
  });
}

export function ProviderChip() {
  const [current, setCurrent] = useState<LLMProvider>(() => getSettings().provider);
  const [options, setOptions] = useState<ProviderOption[]>(() => availableProviders());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Recompute options whenever the chip is opened — handles the case where the
  // rep adds a custom endpoint in Settings, comes back, and would expect the
  // new option to be visible immediately.
  useEffect(() => {
    if (open) {
      setOptions(availableProviders());
      setCurrent(getSettings().provider);
    }
  }, [open]);

  // Close on outside click. Compact UI; no need for a full focus trap.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Keep `current` in sync with cross-tab settings writes (e.g. the rep
  // changes provider via SettingsPanel in another window). Without this the
  // chip would show a stale label after an external write.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SETTINGS_KEY) return;
      setCurrent(getSettings().provider);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function pickProvider(p: LLMProvider) {
    const next = { ...getSettings(), provider: p };
    saveSettings(next);
    setCurrent(p);
    setOpen(false);
  }

  const currentLabel =
    options.find((o) => o.id === current)?.label ??
    ALL_OPTIONS.find((o) => o.id === current)?.label ??
    current;

  // Single configured option → static label. The chip is still informational
  // (rep sees which provider is active) but doesn't pretend to offer a choice.
  if (options.length <= 1) {
    return (
      <span
        title="LLM provider (configure others in Settings)"
        style={chipStyle}
      >
        {currentLabel}
      </span>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`LLM provider: ${currentLabel}. Click to switch.`}
        style={chipStyle}
      >
        {currentLabel}
        <ChevronDown size={10} style={{ marginLeft: 4, opacity: 0.7 }} />
      </button>
      {open && (
        // Using role="menu" + role="menuitemradio" instead of listbox/option.
        // The dropdown is action-driven (pick one) rather than a multi-select
        // widget, and listbox + nested <button role="option"> in <li> wrappers
        // is a malformed ARIA composite that SR implementations announce
        // inconsistently. menu/menuitemradio is the correct pattern for a
        // "pick one of N actions" dropdown.
        <div
          role="menu"
          aria-label="Switch LLM provider"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--surface-1)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            boxShadow: "var(--shadow-2)",
            zIndex: 50,
            minWidth: 140,
            padding: 4,
          }}
        >
          {options.map((opt) => {
            const active = opt.id === current;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pickProvider(opt.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  fontSize: 12,
                  background: active ? "var(--brand-orange)" : "transparent",
                  color: active ? "#0A0A0A" : "var(--ink)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {opt.label}
                {active && (
                  <span style={{ marginLeft: 6, fontSize: 10 }} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 600,
  background: "var(--surface-2)",
  color: "var(--ink-2)",
  border: "1px solid var(--line)",
  borderRadius: 9999,
  cursor: "pointer",
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  letterSpacing: "0.04em",
};

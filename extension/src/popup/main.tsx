import React, { useState } from "react";
import { createRoot } from "react-dom/client";

// Brand-skin popup (post-#87: linear skin dropped). Warm cream canvas
// matching the default sidebar — popup is a brief launcher (<2s on screen)
// and the cohesion with the surface the user is about to land on beats
// the prior dark-popup theatre. Brand orange remains the primary CTA.

// Type definitions kept inline to avoid pulling chrome.d.ts into the popup
// build — the popup runs in MV3 extension context where these globals exist.
declare const chrome: any;

const STYLES = {
  page: {
    padding: 16,
    background: "#EEEFE9",   // brand surface-0 — warm cream
    color: "#23251D",        // brand ink
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    letterSpacing: "-0.02em",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  } as React.CSSProperties,
  mark: {
    width: 32, height: 32,
    background: "#F58549",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    borderRadius: 6,
  } as React.CSSProperties,
  markText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 800,
    fontSize: 13,
    color: "#0A0A0A",
    letterSpacing: "-0.02em",
  } as React.CSSProperties,
  brand: { display: "flex", flexDirection: "column", lineHeight: 1 } as React.CSSProperties,
  brandName: {
    fontWeight: 700,
    fontSize: 14,
    color: "#23251D",           // brand ink
    letterSpacing: "-0.025em",  // brand display tracking
  } as React.CSSProperties,
  brandEyebrow: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "#6A6C61",           // brand ink-4 (4.62:1 on cream — AA-small)
    marginTop: 4,
  } as React.CSSProperties,

  // Primary action row — orange pill button (Wingman brand mark)
  primaryBtn: (hover: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "10px 14px",
    background: "#F58549",
    color: "#0A0A0A",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Inter', system-ui, sans-serif",
    letterSpacing: "-0.01em",
    transition: "filter 140ms ease, transform 140ms ease",
    filter: hover ? "brightness(1.05)" : "none",
    transform: hover ? "translateY(-1px)" : "translateY(0)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  }),

  // Secondary action row — white card on cream (brand surface-1)
  secondaryRow: (hover: boolean): React.CSSProperties => ({
    width: "100%",
    marginTop: 8,
    padding: "10px 14px",
    background: hover ? "#FCFCFA" : "#FFFFFF",  // brand surface-1 / -2
    color: "#23251D",                            // brand ink
    border: "1px solid #BFC1B7",                 // brand line
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Inter', system-ui, sans-serif",
    letterSpacing: "-0.01em",
    transition: "background 140ms ease",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    textAlign: "left" as const,
  }),

  hint: {
    marginTop: 12,
    fontSize: 10,
    color: "#6A6C61",        // brand ink-4
    textAlign: "center" as const,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase" as const,
    letterSpacing: "0.14em",
  } as React.CSSProperties,
};

function Popup() {
  const [openHover, setOpenHover] = useState(false);
  const [insightsHover, setInsightsHover] = useState(false);

  function openSidebar() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]: any) => {
      if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    });
  }

  function openInsights() {
    // Future hook: pass a tab hint to App.tsx via storage so the sidebar
    // opens straight onto the Insights tab. Today it opens the sidebar
    // and the user clicks Insights manually.
    try {
      chrome.storage?.local?.set?.({ clientlens_open_tab: "insights" }, () => { /* noop */ });
    } catch { /* non-extension env */ }
    openSidebar();
  }

  return (
    <div style={STYLES.page}>
      <div style={STYLES.header}>
        <div style={STYLES.mark}>
          <span style={STYLES.markText}>PW</span>
        </div>
        <div style={STYLES.brand}>
          <span style={STYLES.brandName}>Project Wingman</span>
          <span style={STYLES.brandEyebrow}>Sales Copilot</span>
        </div>
      </div>

      <button
        onClick={openSidebar}
        onMouseEnter={() => setOpenHover(true)}
        onMouseLeave={() => setOpenHover(false)}
        style={STYLES.primaryBtn(openHover)}
      >
        <span>Open Sales Copilot</span>
        <span aria-hidden="true">→</span>
      </button>

      <button
        onClick={openInsights}
        onMouseEnter={() => setInsightsHover(true)}
        onMouseLeave={() => setInsightsHover(false)}
        style={STYLES.secondaryRow(insightsHover)}
      >
        <span>This week's insights</span>
        <span aria-hidden="true">→</span>
      </button>

      <div style={STYLES.hint}>Opens in side panel</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);

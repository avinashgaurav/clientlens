import React, { useEffect, useState } from "react";
import { useAppStore } from "./stores/app-store";
import { usePageContext } from "./hooks/usePageContext";
import { PersonalizationForm } from "./components/PersonalizationForm";
import { AssetPreview } from "./components/AssetPreview";
import { CouncilRunner } from "./components/CouncilRunner";
import { ResultPanel } from "./components/ResultPanel";
import { LiveModeToggle } from "./components/LiveModeToggle";
import { DesignerPanel } from "./components/DesignerPanel";
import { KnowledgeBasePanel } from "./components/KnowledgeBasePanel";
import { Header, openSettings } from "./components/Header";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { ObjectionPanel } from "./components/ObjectionPanel";
import { EmailComposer } from "./components/EmailComposer";
import { MeetingCopilotPanel } from "./components/MeetingCopilotPanel";
import { OnboardingChecklist } from "./components/OnboardingChecklist";
import { ErrorBanner } from "./components/ErrorBanner";
import { InsightsPanel } from "./components/InsightsPanel";
import { isMeetingCopilotEnabled } from "../shared/meeting-copilot/feature-flag";
import { listKB } from "../shared/utils/kb-storage";
import { FileText, BookOpen, Radio, BarChart3 } from "lucide-react";

type AdminTab = "form" | "kb" | "copilot" | "insights";

// Skin keys are named after the *surface intent*, not the design-md they
// were inspired by. The visual lineage lives in tokens.css comments; the
// data-skin attribute exposed to the DOM stays product-oriented.
type SkinKey = "brand" | "live" | "insights";

interface TabDef {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
  activeBg: string;
  activeText: string;
  /** Which surface palette powers this tab's content. */
  skin: SkinKey;
}

export default function App() {
  const { user, setUser, isGenerating, lastResult, error, setError, flowStep, outputMode } = useAppStore();
  const { detectContext } = usePageContext();
  const [adminTab, setAdminTab] = useState<AdminTab>("form");
  const [kbCount, setKbCount] = useState(0);

  useEffect(() => {
    detectContext();
    listKB().then((entries) => setKbCount(entries.length)).catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    if (!user) {
      setUser({
        id: "local-user",
        email: "local@clientlens.app",
        name: "You",
        role: "admin",
      });
    }
  }, [user, setUser]);

  if (!user) return null;

  const hasKBAccess = user.role === "admin" || user.role === "pmm" || user.role === "designer";
  const copilotOn = isMeetingCopilotEnabled();

  const tabs: TabDef[] = [
    {
      id: "form",
      label: "Generate",
      icon: <FileText size={12} />,
      activeBg: "bg-orange",
      activeText: "text-black",
      skin: "brand",
    },
    ...(hasKBAccess
      ? [
          {
            id: "kb" as const,
            label: "Knowledge",
            icon: <BookOpen size={12} />,
            activeBg: "bg-orange",
            activeText: "text-black",
            skin: "brand" as const,
          },
        ]
      : []),
    ...(copilotOn
      ? [
          {
            id: "copilot" as const,
            label: "Copilot",
            icon: <Radio size={12} />,
            activeBg: "bg-orange",
            activeText: "text-black",
            skin: "live" as const,
          },
        ]
      : []),
    {
      id: "insights" as const,
      label: "Insights",
      icon: <BarChart3 size={12} />,
      activeBg: "bg-orange",
      activeText: "text-black",
      skin: "insights" as const,
    },
  ];
  const showTabs = tabs.length > 1;

  const activeTab = tabs.find((t) => t.id === adminTab) ?? tabs[0];
  const activeSkin = activeTab.skin;

  return (
    // Outer chrome uses the brand skin — header, tab strip, error banner.
    // Active panel below swaps its data-skin per the active tab.
    <div
      data-skin="brand"
      className="flex flex-col h-screen text-sm overflow-hidden font-sans"
      style={{ background: "var(--surface-0)", color: "var(--ink)" }}
    >
      <Header />

      {showTabs && (
        <div className="px-3 pt-2 pb-1 w-full max-w-[720px] mx-auto">
          <div
            className="flex gap-1 p-1"
            style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
          >
            {tabs.map((t) => {
              const active = adminTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setAdminTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? `${t.activeBg} ${t.activeText}`
                      : "text-ink-3 hover:text-ink hover:bg-surface-2"
                  }`}
                  style={{ borderRadius: 6 }}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active panel inherits the tab's skin via data-skin */}
      <div
        data-skin={activeSkin}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 w-full max-w-[720px] mx-auto"
        style={{ background: "var(--surface-0)", color: "var(--ink)" }}
      >
        {error && (
          <ErrorBanner
            message={error}
            onDismiss={() => setError(null)}
            onOpenSettings={openSettings}
          />
        )}

        <OnboardingChecklist kbCount={kbCount} onOpenSettings={openSettings} />

        {(!showTabs || adminTab === "form") && (
          <>
            <ModeSwitcher />

            {outputMode === "pitch" && (
              <>
                <LiveModeToggle />
                {flowStep === "form" && <PersonalizationForm />}
                {flowStep === "preview" && <AssetPreview />}
                {(flowStep === "generating" || isGenerating) && <CouncilRunner />}
                {flowStep === "result" && lastResult && <ResultPanel result={lastResult} />}
              </>
            )}

            {outputMode === "email" && (
              <>
                {isGenerating && <CouncilRunner />}
                {!isGenerating && <EmailComposer />}
              </>
            )}

            {outputMode === "objection" && (
              <>
                {isGenerating && <CouncilRunner />}
                {!isGenerating && <ObjectionPanel />}
              </>
            )}
          </>
        )}

        {showTabs && adminTab === "kb" && (
          <>
            <KnowledgeBasePanel />
            {(user.role === "designer" || user.role === "admin" || user.role === "pmm") && <DesignerPanel />}
          </>
        )}

        {copilotOn && adminTab === "copilot" && <MeetingCopilotPanel />}

        {adminTab === "insights" && <InsightsPanel />}
      </div>
    </div>
  );
}

import React, { useEffect } from "react";
import { useAppStore } from "../stores/app-store";
import { useCouncil } from "../hooks/useCouncil";
import { GenerationProgress } from "./GenerationProgress";
import { ResearchBriefCard } from "./ResearchBriefCard";

export function CouncilRunner() {
  const { flowStep, generationProgress, isGenerating, researchBrief, outputMode } = useAppStore();
  const { run } = useCouncil();

  useEffect(() => {
    // The pitch council auto-runs when the form transitions to "generating".
    // The email and objection flows reuse CouncilRunner purely as a progress
    // view — their own hooks (useEmailCouncil / useObjection) drive the run.
    // The outputMode guard prevents a future refactor that sets flowStep =
    // "generating" on a non-pitch flow from triggering the wrong council.
    if (flowStep === "generating" && !isGenerating && outputMode === "pitch") {
      run();
    }
  }, [flowStep, isGenerating, outputMode, run]);

  if (!generationProgress) return null;
  return (
    <div className="space-y-3">
      <GenerationProgress progress={generationProgress} />
      {researchBrief && <ResearchBriefCard brief={researchBrief} />}
    </div>
  );
}

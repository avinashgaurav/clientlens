import { useCallback } from "react";
import { useAppStore, STAGE_INFO, type GenerationProgress } from "../stores/app-store";
import { runEmailCouncil } from "../../shared/agents/email-council";
import { listKB } from "../../shared/utils/kb-storage";
import { getStoredModel } from "../../shared/agents/model-catalog";
import type { AgentResult } from "../../shared/types";

const STAGE_MAP: Record<string, GenerationProgress["stage"]> = {
  retrieval: "retrieval",
  drafting: "drafting",
  brand_check: "brand_check",
  validation: "validation",
};

export function useEmailCouncil() {
  const {
    setIsGenerating,
    setGenerationProgress,
    setLastEmail,
    setError,
  } = useAppStore();

  const run = useCallback(async () => {
    // Read emailInput at call time via getState() rather than capturing it
    // in the useCallback closure. The form pattern is `setEmailInput(...);
    // run();` — both calls inside the same handler, with no re-render
    // between them. A closure-captured `emailInput` would still hold the
    // value from the previous render, causing the council to run on stale
    // inputs after the first submit.
    const emailInput = useAppStore.getState().emailInput;
    if (!emailInput) {
      setError("Add the recipient and context, then draft again.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setGenerationProgress({ stage: "retrieval", ...STAGE_INFO.retrieval });

    const kb = await listKB();
    const agentLog: AgentResult[] = [];

    try {
      const modelOverride = getStoredModel() ?? undefined;
      for await (const event of runEmailCouncil({ input: emailInput, kb, modelOverride })) {
        if (event.type === "stage") {
          const mapped = STAGE_MAP[event.stage] ?? "retrieval";
          setGenerationProgress({ stage: mapped, message: event.message, percent: STAGE_INFO[mapped].percent });
        } else if (event.type === "agent") {
          agentLog.push(event.result);
        } else if (event.type === "done") {
          setLastEmail(event.pipeline);
          setGenerationProgress({ stage: "done", ...STAGE_INFO.done });
          notifyIfBackgrounded("Email ready", event.pipeline.final_output.subject, "done");
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Email council failed";
      setError(msg);
      notifyIfBackgrounded("Email drafting failed", msg, "error");
    } finally {
      setIsGenerating(false);
    }
    // emailInput intentionally NOT in deps — read via getState() above.
  }, [setIsGenerating, setGenerationProgress, setLastEmail, setError]);

  return { run };
}

function notifyIfBackgrounded(title: string, message: string, kind: "done" | "error") {
  if (typeof document !== "undefined" && document.hasFocus()) return;
  chrome.runtime.sendMessage({ type: "COUNCIL_NOTIFY", payload: { title, message, kind } }).catch(() => {});
}

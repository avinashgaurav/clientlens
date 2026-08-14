import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { track } from "../../shared/utils/telemetry";

/**
 * Error boundary for the whole side panel (#129).
 *
 * The failure this exists for: a single render error in `App.tsx` unmounted the
 * entire panel to a blank white surface, with nothing on screen to say anything
 * had gone wrong (#128). A blank panel is indistinguishable from a broken
 * install, which generates support noise nobody can debug.
 *
 * Must be a class component: `getDerivedStateFromError` and `componentDidCatch`
 * have no hook equivalents.
 *
 * Note on what gets reported. The panel shows the operator the full message,
 * because they are the one who has to act on it. Telemetry deliberately records
 * only the error's constructor name and the message *length*, never the message
 * body: `telemetry.ts` states it is not for anything where PII matters, and a
 * render error can interpolate values that came from a KB entry or a transcript.
 * The error name is enough to group failures and the count is enough to see the
 * fallback rate, which is what the issue asked for.
 */

interface Props {
  children: React.ReactNode;
  /** Shown above the message. Defaults to the whole panel. */
  surface?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    track({
      name: "sidebar_error_boundary",
      props: {
        error_name: error.name || "Error",
        message_chars: (error.message || "").length,
        component_stack_depth: (info.componentStack || "").split("\n").filter(Boolean).length,
      },
    });

    // Keep the full detail in the extension's own DevTools, where a developer
    // debugging this already is, and where it is not shipped anywhere.
    try {
      console.error("[wingman] sidebar render error", error, info.componentStack);
    } catch {
      /* noop */
    }
  }

  private reload = () => {
    // The panel is a normal extension page, so a reload remounts it from
    // scratch. State lives in chrome.storage, so nothing the rep typed is lost.
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-start gap-3 p-5"
        style={{ background: "var(--surface-0)", color: "var(--ink)" }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} style={{ color: "var(--signal-error)" }} />
          <span
            className="font-mono text-[11px] uppercase"
            style={{ letterSpacing: "0.14em", color: "var(--signal-error)" }}
          >
            {this.props.surface || "Panel"} stopped
          </span>
        </div>

        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Something in the panel failed to render. Reloading usually clears it. Your knowledge base,
          settings and call history are stored separately and are unaffected.
        </p>

        <pre
          className="max-h-40 w-full overflow-auto whitespace-pre-wrap rounded p-2.5 font-mono text-[11px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            color: "var(--ink-4)",
          }}
        >
          {error.name}: {error.message || "no message"}
        </pre>

        <button
          onClick={this.reload}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[11px] uppercase"
          style={{
            letterSpacing: "0.12em",
            background: "var(--brand-orange)",
            // Near-black, not a light token: cream on brand-orange is 2.18:1 and
            // white is 2.52:1, both failing AA. This matches the house pattern for
            // text on orange (ObjectionPanel copy button, MeetingCopilotPanel
            // primaryBtn) at roughly 7:1.
            color: "#0A0A0A",
          }}
        >
          <RotateCcw size={12} />
          Reload panel
        </button>
      </div>
    );
  }
}

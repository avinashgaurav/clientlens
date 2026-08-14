/**
 * Minimal telemetry primitive (#84c).
 *
 * Records named events with optional properties. Today this is a console
 * sink + a 100-event rolling buffer in chrome.storage.local so events can
 * be exported for analysis. A future PR can swap the implementation to
 * PostHog / Amplitude / whatever without changing call sites.
 *
 * Events are typed via a discriminated union (`TelemetryEvent`) so adding
 * a new event name forces the type system to enforce the shape — call
 * sites can't ship `track("typo_event_name", ...)` accidentally.
 *
 * NOT for product analytics where PII matters — call sites should pass
 * IDs, counts, and reasons only. No raw user input, no LLM outputs.
 */

const BUFFER_KEY = "clientlens_telemetry_buffer_v1";
const BUFFER_MAX = 100;

// Discriminated union — extend here when adding new tracked events.
export type TelemetryEvent =
  | {
      name: "objection_response_copied";
      props: { confidence_pct: number; chars: number };
    }
  | {
      name: "objection_disclosure_opened";
      props: { citation_count: number };
    }
  | {
      name: "objection_parse_fallback";
      props: {
        reason: "no_markers" | "out_of_bounds" | "no_citations" | "empty_response";
        markers_detected: number;
        citation_count: number;
      };
    }
  | {
      name: "objection_time_to_copy_ms";
      props: { ms: number; confidence_pct: number };
    }
  | {
      // #129. Deliberately carries no message body: a render error can
      // interpolate values that came from a KB entry or a transcript, and this
      // util is explicitly not for anything where PII matters. The error name
      // groups failures and the event count gives the fallback rate, which is
      // what the issue needed. The operator still sees the full message on screen.
      name: "sidebar_error_boundary";
      props: { error_name: string; message_chars: number; component_stack_depth: number };
    };

interface BufferedEvent {
  name: TelemetryEvent["name"];
  props: TelemetryEvent["props"];
  ts: number;
}

/**
 * Record a typed telemetry event. Returns void — failures are swallowed
 * so a missing chrome.storage (e.g. unit-test env) never breaks UI code.
 */
export function track<E extends TelemetryEvent>(event: E): void {
  const entry: BufferedEvent = {
    name: event.name,
    props: event.props,
    ts: Date.now(),
  };

  // Console sink — visible in the extension's DevTools / service-worker logs.
  // Prefixed with `[wingman:telemetry]` so it's grep-able.
  try {
     
    console.debug(`[wingman:telemetry] ${event.name}`, event.props);
  } catch {
    /* noop */
  }

  // Best-effort buffer write to chrome.storage.local. We read-modify-write
  // which can race under burst events; we tolerate the race because losing
  // one event in a buffer of 100 is acceptable for the use case.
  try {
    chrome.storage?.local?.get?.(BUFFER_KEY, (data) => {
      const prior: BufferedEvent[] = Array.isArray(data?.[BUFFER_KEY]) ? data[BUFFER_KEY] : [];
      const next = [...prior, entry].slice(-BUFFER_MAX);
      try {
        chrome.storage.local.set({ [BUFFER_KEY]: next });
      } catch {
        /* noop */
      }
    });
  } catch {
    /* non-extension env or storage unavailable */
  }
}

/**
 * Read the buffer for debugging / export. Async because chrome.storage is.
 */
export async function readTelemetryBuffer(): Promise<BufferedEvent[]> {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get?.(BUFFER_KEY, (data) => {
        const buf = Array.isArray(data?.[BUFFER_KEY]) ? data[BUFFER_KEY] : [];
        resolve(buf);
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * Clear the buffer. Used by support tooling to reset after export.
 */
export function clearTelemetryBuffer(): void {
  try {
    chrome.storage?.local?.remove?.(BUFFER_KEY);
  } catch {
    /* noop */
  }
}

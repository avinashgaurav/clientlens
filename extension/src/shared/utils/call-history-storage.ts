/**
 * Call-history persistence layer.
 *
 * Saves a flattened post-call record per ended session so the Insights tab
 * (#43) and See-all-calls view (#44) can render real history instead of
 * MOCK_CALLS. The full MeetingPostCallSummary blob is kept alongside the
 * derived stats so drill-down views don't need to re-run the summary agent.
 *
 * Storage: localStorage (matches every other persistence layer in the
 * extension — session-history, settings, KB store). chrome.storage.local
 * is consulted only by clearAllSessionData() for wipe-on-uninstall.
 *
 * Retention: 30 days (vs the 24h cap on the legacy chip-strip store). The
 * Insights / See-all-calls views become materially more useful with a
 * week-plus of context; without it the analytics surface always looks
 * empty. Trade-off: prospect PII (names, quotes, pricing references inside
 * the summary blob) is held longer. Mitigations:
 *   - Hard 30-day cap; old PII still expires.
 *   - 100-record secondary cap on storage volume.
 *   - clearAllSessionData() wipes this key.
 *   - Reps who need indefinite retention should push to CRM via the
 *     Integrations flow — the extension is not the system of record.
 *   - TODO: expose a settings toggle to opt back into the 24h policy for
 *     orgs that cannot tolerate extended retention (follow-up issue).
 */

import type {
  AgendaItemStatus,
  MeetingPostCallSummary,
  MeetingSession,
  SentimentLabel,
  SentimentSnapshot,
} from "../types";

const CALL_HISTORY_KEY = "wingman_call_history_v1";
const LEGACY_KEY = "clientlens_session_history_v1";
const CALL_HISTORY_LIMIT = 100;
const CALL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type CallOutcome = "won" | "next-step" | "follow-up" | "stalled";

// "mixed" is omitted: deriveSentiment never emits it (the score-to-label
// map only produces positive / neutral / negative). Narrowing the field
// here makes the contract with InsightsPanel (#43) explicit.
export type StoredCallSentiment = Exclude<SentimentLabel, "mixed">;

// The persisted blob is a redacted MeetingPostCallSummary — see
// REDACTED_SUMMARY_FIELDS below for what we drop and why.
export type StoredCallSummary = Omit<
  MeetingPostCallSummary,
  "suggested_followup_email" | "suggested_crm_note"
>;

export interface StoredCallRecord {
  id: string;
  saved_at: string; // ISO
  company: string;
  prospect: string;
  date: string; // ISO — session.ended_at where available, else saved_at
  durationMin: number;
  sentiment: StoredCallSentiment;
  sentimentScore: number; // 0-100
  agendaCoverage: number; // 0-100
  objectionsHandled: number; // count of objections RESOLVED (good|weak), not raised
  outcome: CallOutcome;
  summary: StoredCallSummary;
}

// Fields stripped from the stored summary blob. Both are LLM-generated
// from the live transcript and can contain verbatim prospect quotes,
// named individuals, and pricing figures. Either can be regenerated
// on demand from the headline + action items if a drill-down view
// needs them, so the 30-day retention window doesn't have to hold them.
const REDACTED_SUMMARY_FIELDS = ["suggested_followup_email", "suggested_crm_note"] as const;

function redactSummary(summary: MeetingPostCallSummary): StoredCallSummary {
  const redacted: Partial<MeetingPostCallSummary> = { ...summary };
  for (const k of REDACTED_SUMMARY_FIELDS) delete redacted[k];
  return redacted as StoredCallSummary;
}

// ─── Derivation helpers ───────────────────────────────────────────────────────

function sentimentLabelToScore(label: SentimentLabel): number {
  switch (label) {
    case "positive": return 80;
    case "neutral":  return 55;
    case "negative": return 30;
    case "mixed":    return 50;
  }
}

function deriveSentiment(history: SentimentSnapshot[]): { label: StoredCallSentiment; score: number } {
  if (!history.length) return { label: "neutral", score: 50 };
  // End-of-call sentiment matters more than mid-call. Weight later snapshots
  // linearly so the final reading dominates without ignoring the trend.
  const weighted = history.reduce(
    (acc, snap, i) => {
      const w = i + 1;
      return { sum: acc.sum + sentimentLabelToScore(snap.prospect) * w, weight: acc.weight + w };
    },
    { sum: 0, weight: 0 },
  );
  const score = Math.round(weighted.sum / Math.max(1, weighted.weight));
  const label: StoredCallSentiment =
    score >= 70 ? "positive" : score <= 40 ? "negative" : "neutral";
  return { label, score };
}

function deriveAgendaCoverage(items: { status: AgendaItemStatus }[]): number {
  if (!items.length) return 0;
  const covered = items.filter((i) => i.status === "covered").length;
  return Math.round((covered / items.length) * 100);
}

function deriveOutcome(
  summary: MeetingPostCallSummary,
  agendaCoverage: number,
  hasAgenda: boolean,
): CallOutcome {
  const missed = summary.objections_raised.filter((o) => o.response_quality === "missed").length;
  const weak = summary.objections_raised.filter((o) => o.response_quality === "weak").length;
  const actionCount = summary.action_items.length;
  if (missed >= 2 || (missed >= 1 && agendaCoverage < 50)) return "stalled";
  // Any missed objection caps the outcome at "next-step" — a clean "won"
  // requires zero missed objections, not just non-stalled severity.
  if (missed >= 1) return "next-step";
  // Sessions with no agenda set can't earn coverage credit; treat them as
  // "75% covered by default" so a clean call with no agenda can still win.
  const coverageForWin = hasAgenda ? agendaCoverage : 75;
  if (actionCount >= 2 && coverageForWin >= 75 && weak === 0) return "won";
  if (actionCount >= 1) return "next-step";
  return "follow-up";
}

function deriveDurationMin(session: MeetingSession): number {
  if (session.started_at && session.ended_at) {
    return Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.started_at)) / 60000));
  }
  if (session.started_at) {
    return Math.max(0, Math.round((Date.now() - Date.parse(session.started_at)) / 60000));
  }
  return 0;
}

export function buildCallRecord(session: MeetingSession, summary: MeetingPostCallSummary): StoredCallRecord {
  const { label, score } = deriveSentiment(session.sentiment_history);
  const hasAgenda = summary.agenda_coverage.length > 0;
  const agendaCoverage = deriveAgendaCoverage(summary.agenda_coverage);
  // "Handled" = an objection that got a response, good OR weak. Missed
  // objections (the rep had no answer) are excluded — counting them as
  // "handled" inflates the KPI displayed on the Insights tile.
  const objectionsHandled = summary.objections_raised.filter(
    (o) => o.response_quality === "good" || o.response_quality === "weak",
  ).length;
  return {
    id: session.id,
    saved_at: new Date().toISOString(),
    company: session.input.company_name,
    prospect: session.input.persona_role,
    date: session.ended_at ?? new Date().toISOString(),
    durationMin: deriveDurationMin(session),
    sentiment: label,
    sentimentScore: score,
    agendaCoverage,
    objectionsHandled,
    outcome: deriveOutcome(summary, agendaCoverage, hasAgenda),
    summary: redactSummary(summary),
  };
}

// ─── Storage primitives ───────────────────────────────────────────────────────

function withinRetention(r: StoredCallRecord): boolean {
  const t = Date.parse(r.saved_at);
  if (!isFinite(t)) return false;
  return Date.now() - t < CALL_RETENTION_MS;
}

function safeRead(): StoredCallRecord[] {
  try {
    const raw = localStorage.getItem(CALL_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as StoredCallRecord[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(records: StoredCallRecord[]): void {
  try {
    localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(records));
  } catch (err) {
    // localStorage may throw on quota; we drop the write rather than crash
    // the stop-session flow, but we log it so quota issues are visible in
    // the service-worker console instead of failing silently.
    console.warn("[wingman] call-history write failed", err);
  }
}

function sortByRecency(records: StoredCallRecord[]): StoredCallRecord[] {
  return [...records].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at));
}

// ─── Legacy migration ─────────────────────────────────────────────────────────

interface LegacySessionEntry {
  id: string;
  saved_at: string;
  company: string;
  persona: string;
  headline: string;
  summary_markdown: string;
}

// One-shot migration: on first read/write against the new store, fold the
// legacy clientlens_session_history_v1 entries in so users don't lose their
// recent calls. Legacy entries lack the derived stats fields; we backfill
// with neutral defaults. The legacy key is NOT cleared during the dual-write
// transition window — the chip strip still reads from it until #43 ships.
let migrationRan = false;
function runMigrationOnce(): void {
  if (migrationRan) return;
  migrationRan = true;
  let legacy: LegacySessionEntry[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    legacy = raw ? (JSON.parse(raw) as LegacySessionEntry[]) : [];
  } catch {
    return;
  }
  if (!legacy.length) return;
  const existing = safeRead();
  const existingIds = new Set(existing.map((r) => r.id));
  const toMigrate: StoredCallRecord[] = legacy
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({
      id: e.id,
      saved_at: e.saved_at,
      company: e.company,
      prospect: e.persona,
      date: e.saved_at,
      durationMin: 0,
      sentiment: "neutral",
      sentimentScore: 50,
      agendaCoverage: 0,
      objectionsHandled: 0,
      outcome: "follow-up",
      summary: {
        session_id: e.id,
        headline: e.headline,
        what_went_well: [],
        what_to_improve: [],
        objections_raised: [],
        action_items: [],
        agenda_coverage: [],
        generated_at: e.saved_at,
      },
    }));
  if (toMigrate.length) {
    safeWrite(
      sortByRecency([...toMigrate, ...existing])
        .filter(withinRetention)
        .slice(0, CALL_HISTORY_LIMIT),
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function listCallRecords(): StoredCallRecord[] {
  runMigrationOnce();
  const all = safeRead();
  const fresh = all.filter(withinRetention);
  if (fresh.length !== all.length) safeWrite(fresh);
  return fresh;
}

export function saveCallRecord(record: StoredCallRecord): void {
  runMigrationOnce();
  const existing = safeRead().filter((r) => r.id !== record.id);
  const next = sortByRecency([record, ...existing])
    .filter(withinRetention)
    .slice(0, CALL_HISTORY_LIMIT);
  safeWrite(next);
}

export function getCallRecord(id: string): StoredCallRecord | null {
  return listCallRecords().find((r) => r.id === id) ?? null;
}

export function clearCallHistory(): void {
  try {
    localStorage.removeItem(CALL_HISTORY_KEY);
  } catch {
    /* ignore */
  }
  try {
    chrome.storage?.local?.remove(CALL_HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

// Exposed for clearAllSessionData() in settings-storage.ts so the
// wipe-everything button keeps wiping everything.
export const CALL_HISTORY_STORAGE_KEY = CALL_HISTORY_KEY;

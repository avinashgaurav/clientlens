import React, { useMemo, useState } from "react";
import { Play, TrendingUp, MessageCircle, Clock, Award, Radio } from "lucide-react";
import { useCallHistory } from "../hooks/useCallHistory";
import type { StoredCallRecord } from "../../shared/utils/call-history-storage";
import { CallHistoryTable } from "./CallHistoryTable";

// Spotify-skinned post-call insights. The album-grid metaphor maps onto
// a call-history tile grid: each tile = one prospect call. Data comes
// from call-history-storage (localStorage, 30-day retention) via the
// useCallHistory hook.

interface CallSummary {
  id: string;
  company: string;
  prospect: string;
  dateLabel: string;
  durationMin: number;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // 0-100
  agendaCoverage: number; // 0-100
  objectionsHandled: number;
  outcome: "won" | "next-step" | "follow-up" | "stalled";
}

// Relative date label matching the panel's tile design.
// Today: "Today · 2:30 PM" / Yesterday: "Yesterday · 11:00 AM" /
// Within 7d: "Wed · 4:15 PM" / Older: "May 12 · 9:00 AM"
function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    return `${d.toLocaleDateString([], { weekday: "short" })} · ${time}`;
  }
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function toCallSummary(r: StoredCallRecord): CallSummary {
  return {
    id: r.id,
    company: r.company,
    prospect: r.prospect,
    dateLabel: formatDateLabel(r.date),
    durationMin: r.durationMin,
    sentiment: r.sentiment,
    sentimentScore: r.sentimentScore,
    agendaCoverage: r.agendaCoverage,
    objectionsHandled: r.objectionsHandled,
    outcome: r.outcome,
  };
}

const SENTIMENT_COLOR: Record<CallSummary["sentiment"], string> = {
  positive: "var(--signal-live)",        // spotify green
  neutral: "var(--ink-4)",
  negative: "var(--signal-error)",
};

const OUTCOME_LABEL: Record<CallSummary["outcome"], string> = {
  won: "Won",
  "next-step": "Next step",
  "follow-up": "Follow-up",
  stalled: "Stalled",
};

function CallTile({ call }: { call: CallSummary }) {
  return (
    <button
      type="button"
      className="tile-spotify text-left p-3 flex flex-col gap-2 cursor-pointer"
      style={{
        background: "var(--surface-1)",
        border: `1px solid var(--line-2)`,
        borderRadius: 6,
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* "Album art" header — gradient block + circular play button */}
      <div
        className="relative w-full aspect-[4/3] flex items-end p-2 mb-1"
        style={{
          background: `linear-gradient(135deg, var(--surface-3) 0%, var(--surface-2) 100%)`,
          borderRadius: 4,
        }}
      >
        <div
          className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5"
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "var(--ink)",
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          <span
            className="signal-dot"
            style={{ background: SENTIMENT_COLOR[call.sentiment], width: 6, height: 6 }}
          />
          {call.sentiment}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="font-bold truncate"
            style={{ color: "var(--ink)", fontSize: 18, lineHeight: 1.1 }}
          >
            {call.company}
          </div>
          <div
            className="truncate mt-0.5"
            style={{ color: "var(--ink-4)", fontSize: 11 }}
          >
            {call.prospect}
          </div>
        </div>

        <div
          className="absolute bottom-2 right-2 flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--signal-live)",
            color: "#000000",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <Play size={14} fill="#000000" />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--ink-4)" }}>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {call.durationMin}m
        </span>
        <span>{call.dateLabel}</span>
      </div>

      {/* Bars: sentiment + agenda */}
      <div className="space-y-1.5 mt-1">
        <BarRow label="Sentiment" value={call.sentimentScore} color={SENTIMENT_COLOR[call.sentiment]} />
        <BarRow label="Agenda" value={call.agendaCoverage} color="var(--accent-blue)" />
      </div>

      {/* Footer chips */}
      <div className="flex items-center justify-between mt-1">
        <span
          className="px-2 py-0.5 font-bold"
          style={{
            background: "var(--surface-2)",
            color: "var(--ink-3)",
            borderRadius: 9999,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {OUTCOME_LABEL[call.outcome]}
        </span>
        <span className="flex items-center gap-1" style={{ color: "var(--ink-4)", fontSize: 11 }}>
          <MessageCircle size={11} />
          {call.objectionsHandled}
        </span>
      </div>
    </button>
  );
}

function BarRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div
        className="flex items-center justify-between mb-0.5 eyebrow"
        style={{ fontSize: 9, color: "var(--ink-4)" }}
      >
        <span>{label}</span>
        <span className="num" style={{ color: "var(--ink-3)", fontWeight: 700 }}>
          {value}%
        </span>
      </div>
      <div className="w-full overflow-hidden" style={{ background: "var(--surface-3)", height: 4, borderRadius: 9999 }}>
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: color,
            borderRadius: 9999,
          }}
        />
      </div>
    </div>
  );
}

function HeroStat({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="p-3 flex flex-col gap-1"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-2)",
        borderRadius: 6,
      }}
    >
      <div className="flex items-center gap-1.5 eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>
        {icon}
        {label}
      </div>
      <div className="num font-bold" style={{ color: "var(--ink)", fontSize: 24, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ color: "var(--ink-4)", fontSize: 10 }}>{sub}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="px-4 py-12 flex flex-col items-center text-center gap-3"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-2)",
        borderRadius: 8,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--surface-2)",
          color: "var(--signal-live)",
        }}
      >
        <Radio size={20} />
      </div>
      <h3 className="display-heading" style={{ color: "var(--ink)", fontSize: 18 }}>
        No calls yet.
      </h3>
      <p style={{ color: "var(--ink-3)", fontSize: 13, maxWidth: 320, lineHeight: 1.45 }}>
        Start a Meeting Copilot session from the Copilot tab. Wingman will
        save the post-call summary here automatically.
      </p>
      <p className="eyebrow" style={{ fontSize: 9, color: "var(--ink-5)" }}>
        Call history retained for 30 days · stored locally
      </p>
    </div>
  );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ViewMode = "grid" | "table";

export function InsightsPanel() {
  const { records, empty } = useCallHistory();
  const calls = useMemo(() => records.map(toCallSummary), [records]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // "This Week" hero stats are computed from the 7-day slice; the Total Calls
  // KPI tile shows the full 30-day count so reps see the broader picture too.
  // (Hook call placed above any conditional return so rules-of-hooks ordering
  // stays stable if future edits add another early return above the table view.)
  const stats = useMemo(() => {
    const totalCalls = records.length;
    const cutoff = Date.now() - WEEK_MS;
    const thisWeek = records.filter((r) => {
      const t = Date.parse(r.date);
      return isFinite(t) && t >= cutoff;
    });
    const weekCount = thisWeek.length;
    if (weekCount === 0) {
      return { totalCalls, weekCount: 0, winRate: 0, avgSentiment: 0, totalObjections: 0 };
    }
    const winRate = Math.round(
      (thisWeek.filter((r) => r.outcome === "won" || r.outcome === "next-step").length / weekCount) * 100,
    );
    const avgSentiment = Math.round(
      thisWeek.reduce((s, r) => s + r.sentimentScore, 0) / weekCount,
    );
    const totalObjections = thisWeek.reduce((s, r) => s + r.objectionsHandled, 0);
    return { totalCalls, weekCount, winRate, avgSentiment, totalObjections };
  }, [records]);

  // Drill-in to the full-history table (#44). CallHistoryTable handles its
  // own empty state, so we don't gate this on `!empty` — a mid-session prune
  // shows "No calls" inside the table instead of silently teleporting the
  // user back to the grid empty state.
  if (viewMode === "table") {
    return <CallHistoryTable records={records} onBack={() => setViewMode("grid")} />;
  }

  if (empty) {
    return (
      <div className="space-y-3">
        <div>
          <div className="eyebrow mb-1">This Week</div>
          <h2
            className="display-heading"
            style={{ color: "var(--ink)", fontSize: 24, lineHeight: 1.15 }}
          >
            Nothing to review yet.
          </h2>
          <p className="mt-1" style={{ color: "var(--ink-3)", fontSize: 13 }}>
            Your post-call insights show up here after your first session.
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  const noCallsThisWeek = stats.weekCount === 0;
  return (
    <div className="space-y-3">
      {/* Eyebrow + hero */}
      <div>
        <div className="eyebrow mb-1">This Week</div>
        <h2
          className="display-heading"
          style={{ color: "var(--ink)", fontSize: 24, lineHeight: 1.15 }}
        >
          {noCallsThisWeek ? "Quiet week." : "You closed it."}
        </h2>
        <p className="mt-1" style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {noCallsThisWeek
            ? `No sessions in the last 7 days. ${stats.totalCalls} ${stats.totalCalls === 1 ? "call" : "calls"} in the last 30 days.`
            : `${stats.weekCount} ${stats.weekCount === 1 ? "call" : "calls"} this week. ${stats.winRate}% with a next step or won.`}
        </p>
      </div>

      {/* Hero stats grid (4 KPIs). Three are weekly; "Total calls" is the
          full 30-day window so reps still see the broader history. */}
      <div className="grid grid-cols-2 gap-2">
        <HeroStat
          icon={<TrendingUp size={11} />}
          label="Win rate"
          value={noCallsThisWeek ? "—" : `${stats.winRate}%`}
          sub="This week · won or next-step"
        />
        <HeroStat
          icon={<Award size={11} />}
          label="Avg sentiment"
          value={noCallsThisWeek ? "—" : `${stats.avgSentiment}`}
          sub="This week"
        />
        <HeroStat
          icon={<MessageCircle size={11} />}
          label="Objections handled"
          value={`${stats.totalObjections}`}
          sub="This week · resolved"
        />
        <HeroStat
          icon={<Clock size={11} />}
          label="Total calls"
          value={`${stats.totalCalls}`}
          sub="Last 30 days"
        />
      </div>

      {/* Call history grid */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Recent calls</div>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            aria-label="See all calls"
            className="text-[11px] font-semibold"
            style={{ color: "var(--signal-live)" }}
          >
            See all →
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {calls.map((c) => (
            <CallTile key={c.id} call={c} />
          ))}
        </div>
      </div>

      <div
        className="text-center py-3"
        style={{ color: "var(--ink-5)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
      >
        {stats.totalCalls} {stats.totalCalls === 1 ? "call" : "calls"} stored · 30-day retention
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { Play, TrendingUp, MessageCircle, Clock, Award } from "lucide-react";

// Spotify-skinned post-call insights. The album-grid metaphor maps onto
// a call-history tile grid: each tile = one prospect call. The numbers
// are illustrative placeholders sourced from the existing call history
// shape; wire to a real store when the post-call summary persistence
// layer lands.

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

// TODO(post-call-persistence): replace MOCK_CALLS with a real
// usePostCallStore() selector once post-call summaries are persisted.
// Until then, the Insights tab is gated behind VITE_ENABLE_INSIGHTS so
// default installs don't see fabricated call history.
const MOCK_CALLS: CallSummary[] = [
  {
    id: "c-1",
    company: "Acme Cloud",
    prospect: "Priya Patel · VP Sales",
    dateLabel: "Today · 2:30 PM",
    durationMin: 32,
    sentiment: "positive",
    sentimentScore: 82,
    agendaCoverage: 95,
    objectionsHandled: 3,
    outcome: "next-step",
  },
  {
    id: "c-2",
    company: "Northwind Logistics",
    prospect: "Marco Silva · CFO",
    dateLabel: "Yesterday · 11:00 AM",
    durationMin: 28,
    sentiment: "neutral",
    sentimentScore: 56,
    agendaCoverage: 78,
    objectionsHandled: 5,
    outcome: "follow-up",
  },
  {
    id: "c-3",
    company: "Quantum Retail",
    prospect: "Jordan Lee · CTO",
    dateLabel: "Wed · 4:15 PM",
    durationMin: 41,
    sentiment: "positive",
    sentimentScore: 71,
    agendaCoverage: 88,
    objectionsHandled: 2,
    outcome: "won",
  },
  {
    id: "c-4",
    company: "Helios Energy",
    prospect: "Sam Okafor · RevOps",
    dateLabel: "Tue · 9:00 AM",
    durationMin: 24,
    sentiment: "negative",
    sentimentScore: 32,
    agendaCoverage: 60,
    objectionsHandled: 7,
    outcome: "stalled",
  },
  {
    id: "c-5",
    company: "Drift Mobile",
    prospect: "Alex Mwangi · VP Sales",
    dateLabel: "Tue · 3:00 PM",
    durationMin: 19,
    sentiment: "positive",
    sentimentScore: 78,
    agendaCoverage: 92,
    objectionsHandled: 1,
    outcome: "next-step",
  },
  {
    id: "c-6",
    company: "Brightline Labs",
    prospect: "Mei Chen · CTO",
    dateLabel: "Mon · 1:30 PM",
    durationMin: 36,
    sentiment: "neutral",
    sentimentScore: 51,
    agendaCoverage: 70,
    objectionsHandled: 4,
    outcome: "follow-up",
  },
];

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

export function InsightsPanel() {
  const stats = useMemo(() => {
    const totalCalls = MOCK_CALLS.length;
    const winRate = Math.round(
      (MOCK_CALLS.filter((c) => c.outcome === "won" || c.outcome === "next-step").length / totalCalls) * 100
    );
    const avgSentiment = Math.round(
      MOCK_CALLS.reduce((s, c) => s + c.sentimentScore, 0) / totalCalls
    );
    const totalObjections = MOCK_CALLS.reduce((s, c) => s + c.objectionsHandled, 0);
    return { totalCalls, winRate, avgSentiment, totalObjections };
  }, []);

  return (
    <div className="space-y-3">
      {/* Demo data banner — visible while the persistence layer is unwired
          so previewers know the numbers below are illustrative. */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderLeft: "3px solid var(--signal-warn)",
          color: "var(--ink-3)",
          fontSize: 11,
          borderRadius: 4,
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--signal-warn)",
          }}
        >
          Demo
        </span>
        <span>
          Showing example call data. Real post-call summaries appear here once
          the persistence layer ships.
        </span>
      </div>

      {/* Eyebrow + hero */}
      <div>
        <div className="eyebrow mb-1">This Week</div>
        <h2
          className="font-bold"
          style={{ color: "var(--ink)", fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.03em" }}
        >
          You closed it.
        </h2>
        <p className="mt-1" style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {stats.totalCalls} calls this week. {stats.winRate}% with a next step or won.
        </p>
      </div>

      {/* Hero stats grid (4 KPIs) */}
      <div className="grid grid-cols-2 gap-2">
        <HeroStat
          icon={<TrendingUp size={11} />}
          label="Win rate"
          value={`${stats.winRate}%`}
          sub="Won or next-step"
        />
        <HeroStat
          icon={<Award size={11} />}
          label="Avg sentiment"
          value={`${stats.avgSentiment}`}
          sub="Across all calls"
        />
        <HeroStat
          icon={<MessageCircle size={11} />}
          label="Objections handled"
          value={`${stats.totalObjections}`}
          sub="This week"
        />
        <HeroStat
          icon={<Clock size={11} />}
          label="Total calls"
          value={`${stats.totalCalls}`}
          sub="All recorded"
        />
      </div>

      {/* Call history grid */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Recent calls</div>
          <button
            type="button"
            disabled
            aria-label="See all calls (coming soon)"
            title="Coming soon — wired with the post-call persistence layer"
            className="text-[11px] font-semibold cursor-not-allowed"
            style={{ color: "var(--signal-live)", opacity: 0.5 }}
          >
            See all →
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {MOCK_CALLS.map((c) => (
            <CallTile key={c.id} call={c} />
          ))}
        </div>
      </div>

      <div
        className="text-center py-3"
        style={{ color: "var(--ink-5)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
      >
        End of week · {stats.totalCalls} calls
      </div>
    </div>
  );
}

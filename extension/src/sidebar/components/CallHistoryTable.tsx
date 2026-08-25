import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import type {
  StoredCallRecord,
  CallOutcome,
  StoredCallSentiment,
} from "../../shared/utils/call-history-storage";

/**
 * Dense, filterable, sortable table for the full call history. Rendered
 * in place of the InsightsPanel grid when the user clicks "See all".
 * Option A from #44: reuses sidebar real estate, no new entry points.
 */

type DateRange = "7d" | "30d" | "all";
type SentimentFilter = "all" | StoredCallSentiment;
type OutcomeFilter = "all" | CallOutcome;

type SortColumn = "date" | "company" | "duration" | "sentiment" | "coverage" | "outcome";
type SortDirection = "asc" | "desc";

const RANGE_MS: Record<Exclude<DateRange, "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const SENTIMENT_LABEL: Record<StoredCallSentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  won: "Won",
  "next-step": "Next step",
  "follow-up": "Follow-up",
  stalled: "Stalled",
};

const SENTIMENT_COLOR: Record<StoredCallSentiment, string> = {
  positive: "var(--signal-live)",
  neutral: "var(--ink-4)",
  negative: "var(--signal-error)",
};

// Sentiment carries a natural order (negative < neutral < positive) which
// the sentimentScore preserves anyway, so we sort by score even when the
// user clicked the "Sentiment" column header.
function comparator(column: SortColumn, dir: SortDirection) {
  const m = dir === "asc" ? 1 : -1;
  return (a: StoredCallRecord, b: StoredCallRecord): number => {
    switch (column) {
      case "date":
        return (Date.parse(a.date) - Date.parse(b.date)) * m;
      case "company":
        return a.company.localeCompare(b.company) * m;
      case "duration":
        return (a.durationMin - b.durationMin) * m;
      case "sentiment":
        return (a.sentimentScore - b.sentimentScore) * m;
      case "coverage":
        return (a.agendaCoverage - b.agendaCoverage) * m;
      case "outcome": {
        // Outcome rank: won > next-step > follow-up > stalled.
        const rank: Record<CallOutcome, number> = {
          won: 4,
          "next-step": 3,
          "follow-up": 2,
          stalled: 1,
        };
        return (rank[a.outcome] - rank[b.outcome]) * m;
      }
    }
  };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "n/a";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={10} style={{ opacity: 0.4 }} />;
  return direction === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
}

interface Props {
  records: StoredCallRecord[];
  onBack: () => void;
}

export function CallHistoryTable({ records, onBack }: Props) {
  const [range, setRange] = useState<DateRange>("30d");
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const filtered = useMemo(() => {
    const now = Date.now();
    return records.filter((r) => {
      if (range !== "all") {
        const t = Date.parse(r.date);
        if (!isFinite(t)) return false;
        if (now - t > RANGE_MS[range]) return false;
      }
      if (sentiment !== "all" && r.sentiment !== sentiment) return false;
      if (outcome !== "all" && r.outcome !== outcome) return false;
      return true;
    });
  }, [records, range, sentiment, outcome]);

  const sorted = useMemo(
    () => [...filtered].sort(comparator(sortColumn, sortDir)),
    [filtered, sortColumn, sortDir],
  );

  // First-click defaults: numeric columns descend (largest first), string
  // columns ascend (A→Z). Listed as a set so future string columns inherit
  // the right default without touching this logic.
  const numericCols = new Set<SortColumn>(["date", "duration", "sentiment", "coverage", "outcome"]);
  function toggleSort(col: SortColumn) {
    if (col === sortColumn) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir(numericCols.has(col) ? "desc" : "asc");
    }
  }

  return (
    <div className="space-y-3">
      {/* Header row: back button + title + count */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: "var(--signal-live)" }}
          aria-label="Back to Insights"
        >
          <ArrowLeft size={12} /> Back
        </button>
        <div className="eyebrow" style={{ fontSize: 9 }}>
          {sorted.length} of {records.length} {records.length === 1 ? "call" : "calls"}
        </div>
      </div>

      <h2
        className="font-bold"
        style={{ color: "var(--ink)", fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.03em" }}
      >
        All calls
      </h2>

      {/* Filter row */}
      <div className="grid grid-cols-3 gap-2">
        <FilterSelect
          label="Range"
          value={range}
          onChange={(v) => setRange(v as DateRange)}
          options={[
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "all", label: "All stored" },
          ]}
        />
        <FilterSelect
          label="Sentiment"
          value={sentiment}
          onChange={(v) => setSentiment(v as SentimentFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "positive", label: "Positive" },
            { value: "neutral", label: "Neutral" },
            { value: "negative", label: "Negative" },
          ]}
        />
        <FilterSelect
          label="Outcome"
          value={outcome}
          onChange={(v) => setOutcome(v as OutcomeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "won", label: "Won" },
            { value: "next-step", label: "Next step" },
            { value: "follow-up", label: "Follow-up" },
            { value: "stalled", label: "Stalled" },
          ]}
        />
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div
          className="px-3 py-8 text-center"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--line-2)",
            borderRadius: 6,
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          {records.length === 0
            ? "No calls in history yet. Run a Meeting Copilot session to populate this view."
            : "No calls match the current filters."}
        </div>
      ) : (
        <div
          className="overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--line-2)",
            borderRadius: 6,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th col="date" label="Date" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <Th col="company" label="Company" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <Th col="duration" label="Min" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} align="right" />
                <Th col="sentiment" label="Sent." sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} align="right" />
                <Th col="coverage" label="Cov." sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} align="right" />
                <Th col="outcome" label="Outcome" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--line-2)",
                    color: "var(--ink-2)",
                  }}
                >
                  <td style={cell()}>{shortDate(r.date)}</td>
                  <td style={cell()}>
                    <div className="truncate font-semibold" style={{ color: "var(--ink)" }}>
                      {r.company}
                    </div>
                    <div className="truncate" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                      {r.prospect}
                    </div>
                  </td>
                  <td style={cell("right")} className="tabular-nums">{r.durationMin}</td>
                  <td style={cell("right")} className="tabular-nums">
                    <span
                      className="signal-dot mr-1"
                      style={{
                        background: SENTIMENT_COLOR[r.sentiment],
                        width: 6,
                        height: 6,
                        verticalAlign: "middle",
                      }}
                      aria-label={SENTIMENT_LABEL[r.sentiment]}
                    />
                    {r.sentimentScore}
                  </td>
                  <td style={cell("right")} className="tabular-nums">{r.agendaCoverage}%</td>
                  <td style={cell()}>
                    <span
                      className="px-1.5 py-0.5 font-bold"
                      style={{
                        background: "var(--surface-3)",
                        color: "var(--ink-3)",
                        borderRadius: 9999,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {OUTCOME_LABEL[r.outcome]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function cell(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    padding: "8px 10px",
    textAlign: align,
    verticalAlign: "middle",
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function Th({
  col,
  label,
  sortColumn,
  sortDir,
  onSort,
  align = "left",
}: {
  col: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDir: SortDirection;
  onSort: (c: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sortColumn === col;
  return (
    <th
      // aria-sort belongs on the cell, not on a nested button (ARIA 1.2).
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
      style={{
        padding: "8px 10px",
        textAlign: align,
        color: active ? "var(--ink)" : "var(--ink-4)",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1"
        style={{ color: "inherit", background: "transparent", border: "none" }}
      >
        {label}
        <SortIcon active={active} direction={sortDir} />
      </button>
    </th>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5"
        style={{
          background: "var(--surface-1)",
          color: "var(--ink)",
          border: "1px solid var(--line)",
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * First-run sample data fixtures (#94, part of #86 batch).
 *
 * Loads/unloads generic stand-in KB entries + call records so a first-time
 * rep can see what the populated product looks like before doing any real
 * work. All sample entries are tagged via an ID prefix so cleanup is
 * atomic and never touches real data.
 *
 * Tagging strategy: id startsWith DEMO_KB_PREFIX (for KB) or
 * DEMO_CALL_PREFIX (for call history). Visible name carries a "(sample)"
 * suffix on KB entries.
 *
 * Companies are intentionally fictional so a sample appearing in a
 * screenshot or screen recording is obviously not real customer data.
 */

import type { KBEntry } from "../types";
import { listKB, addKB, removeKB } from "./kb-storage";
import {
  listCallRecords,
  saveCallRecord,
  removeCallRecord,
  type StoredCallRecord,
} from "./call-history-storage";

export const DEMO_KB_PREFIX = "demo_kb_";
export const DEMO_CALL_PREFIX = "demo_call_";

const SAMPLE_KB_FIXTURES: Omit<KBEntry, "uploaded_at">[] = [
  {
    id: DEMO_KB_PREFIX + "wingman-playbook",
    name: "Wingman Sales Playbook (sample)",
    namespace: "product_overview",
    source_type: "text",
    content:
      "Wingman is an AI sales copilot that runs in your Chrome sidebar. " +
      "Council of 5 agents (sentiment / agenda / coach / objection / validator) " +
      "coaches you live during the call and grounds every pitch in this KB. " +
      "BYOL: your data goes only to your configured LLM provider. " +
      "Free, open-source, MIT licensed.",
    status: "ready",
    uploaded_by: "demo",
    uploaded_by_role: "admin",
    index_status: "ready",
    index_chunk_count: 4,
  },
  {
    id: DEMO_KB_PREFIX + "acme-cloud-overview",
    name: "Acme Cloud Product Overview (sample)",
    namespace: "product_overview",
    source_type: "text",
    content:
      "Acme Cloud is a fictional FinOps platform used here as a sample. " +
      "Treat references in council outputs as placeholders, not real data. " +
      "Real product details live in your actual KB once you add entries.",
    status: "ready",
    uploaded_by: "demo",
    uploaded_by_role: "admin",
    index_status: "ready",
    index_chunk_count: 2,
  },
  {
    id: DEMO_KB_PREFIX + "northwind-case-study",
    name: "Northwind Logistics Case Study (sample)",
    namespace: "case_studies",
    source_type: "text",
    content:
      "Sample case study. Northwind Logistics is a fictional mid-market " +
      "shipping company. They reduced idle cloud spend by 22% over two " +
      "quarters using a hypothetical implementation. Use this entry to " +
      "see how the council cites case studies in objection responses.",
    status: "ready",
    uploaded_by: "demo",
    uploaded_by_role: "admin",
    index_status: "ready",
    index_chunk_count: 3,
  },
  {
    id: DEMO_KB_PREFIX + "pricing-faq",
    name: "Pricing FAQ (sample)",
    namespace: "roi_pricing",
    source_type: "text",
    content:
      "Sample pricing FAQ. Wingman itself is free and open source. " +
      "Your only cost is the LLM provider API charges for the council " +
      "calls (~$0.08 per pitch on Gemini Flash, varies by provider). " +
      "No per-seat licensing. No data leaves your machine to Wingman's " +
      "servers; it goes only to your configured LLM provider.",
    status: "ready",
    uploaded_by: "demo",
    uploaded_by_role: "admin",
    index_status: "ready",
    index_chunk_count: 3,
  },
  {
    id: DEMO_KB_PREFIX + "security-one-pager",
    name: "Security One-Pager (sample)",
    namespace: "security_compliance",
    source_type: "text",
    content:
      "Sample security overview. Wingman is local-first. Transcripts and " +
      "summaries live in localStorage on the rep's browser. Retention " +
      "caps: 24h for session history, 30d for call history (configurable). " +
      "No shared backend. The rep's chosen LLM provider sees the prompts " +
      "but never persists them on Wingman's side.",
    status: "ready",
    uploaded_by: "demo",
    uploaded_by_role: "admin",
    index_status: "ready",
    index_chunk_count: 4,
  },
];

// generated_at on each fixture's summary blob is set at loadSampleData()
// call time, not module-import time — otherwise the timestamp would
// freeze to whenever the module was first dynamically imported.
type SampleCallFixture = Omit<StoredCallRecord, "saved_at" | "date" | "summary"> & {
  summary: Omit<StoredCallRecord["summary"], "generated_at">;
};

const SAMPLE_CALL_FIXTURES: SampleCallFixture[] = [
  {
    id: DEMO_CALL_PREFIX + "acme-cloud-vpsales",
    company: "Acme Cloud",
    prospect: "VP Sales",
    durationMin: 32,
    sentiment: "positive",
    sentimentScore: 82,
    agendaCoverage: 95,
    objectionsHandled: 3,
    outcome: "next-step",
    summary: {
      session_id: DEMO_CALL_PREFIX + "acme-cloud-vpsales",
      headline: "Sample call — Acme Cloud VP Sales engaged on Q3 pipeline expansion",
      what_went_well: ["Strong opening", "Clear next steps", "ROI framing landed"],
      what_to_improve: ["More discovery before pricing"],
      objections_raised: [
        { objection: "Already using Gong", response_quality: "good" },
        { objection: "Pricing seems high", response_quality: "good" },
        { objection: "Need security review", response_quality: "weak" },
      ],
      action_items: [
        { owner: "rep", text: "Send security one-pager (sample)" },
        { owner: "rep", text: "Schedule technical demo with VP Eng" },
        { owner: "prospect", text: "Loop in CFO for budget alignment" },
      ],
      agenda_coverage: [
        { item: "Intro + discovery", status: "covered" },
        { item: "Product demo", status: "covered" },
        { item: "Pricing + ROI", status: "covered" },
        { item: "Next steps", status: "covered" },
      ],
    },
  },
  {
    id: DEMO_CALL_PREFIX + "northwind-cfo",
    company: "Northwind Logistics",
    prospect: "CFO",
    durationMin: 28,
    sentiment: "neutral",
    sentimentScore: 56,
    agendaCoverage: 78,
    objectionsHandled: 5,
    outcome: "follow-up",
    summary: {
      session_id: DEMO_CALL_PREFIX + "northwind-cfo",
      headline: "Sample call — Northwind CFO open to pilot, needs board sign-off",
      what_went_well: ["TCO model resonated", "Case study comparison helped"],
      what_to_improve: ["Less product detail, more business impact"],
      objections_raised: [
        { objection: "Q4 budget already allocated", response_quality: "weak" },
        { objection: "Board wants a formal RFP", response_quality: "good" },
      ],
      action_items: [
        { owner: "rep", text: "Send TCO comparison spreadsheet" },
        { owner: "prospect", text: "Discuss with board in Q1 planning" },
      ],
      agenda_coverage: [
        { item: "Discovery", status: "covered" },
        { item: "TCO walkthrough", status: "covered" },
        { item: "Pilot scope", status: "skipped" },
      ],
    },
  },
  {
    id: DEMO_CALL_PREFIX + "quantum-retail-cto",
    company: "Quantum Retail",
    prospect: "CTO",
    durationMin: 41,
    sentiment: "positive",
    sentimentScore: 71,
    agendaCoverage: 88,
    objectionsHandled: 2,
    outcome: "won",
    summary: {
      session_id: DEMO_CALL_PREFIX + "quantum-retail-cto",
      headline: "Sample call — Quantum Retail CTO ready to sign, contract in legal",
      what_went_well: ["Technical depth", "Security questions addressed cleanly"],
      what_to_improve: [],
      objections_raised: [
        { objection: "Need SSO from day one", response_quality: "good" },
        { objection: "Data residency in EU", response_quality: "good" },
      ],
      action_items: [
        { owner: "rep", text: "Forward MSA to procurement" },
        { owner: "prospect", text: "Sign contract by Friday" },
      ],
      agenda_coverage: [
        { item: "Tech deep-dive", status: "covered" },
        { item: "Security review", status: "covered" },
        { item: "Contract terms", status: "covered" },
      ],
    },
  },
  {
    id: DEMO_CALL_PREFIX + "helios-revops",
    company: "Helios Energy",
    prospect: "RevOps",
    durationMin: 24,
    sentiment: "negative",
    sentimentScore: 32,
    agendaCoverage: 60,
    objectionsHandled: 7,
    outcome: "stalled",
    summary: {
      session_id: DEMO_CALL_PREFIX + "helios-revops",
      headline: "Sample call — Helios RevOps not the right buyer, lost",
      what_went_well: ["Caught the misalignment early"],
      what_to_improve: ["Qualify before deep-dive", "Push for the actual decision-maker sooner"],
      objections_raised: [
        { objection: "We don't have this problem", response_quality: "missed" },
        { objection: "Already evaluated competitors", response_quality: "missed" },
        { objection: "No budget this year", response_quality: "weak" },
      ],
      action_items: [],
      agenda_coverage: [
        { item: "Discovery", status: "covered" },
        { item: "Demo", status: "skipped" },
        { item: "Pricing", status: "skipped" },
      ],
    },
  },
];

export async function loadSampleData(): Promise<void> {
  const now = new Date().toISOString();

  // Idempotence guard: skip any KB fixture whose id is already in the store.
  // Without this, toggling Settings off→on (or load racing with another
  // CTA-triggered load) would duplicate entries with the same id.
  const existingKb = await listKB();
  const existingKbIds = new Set(existingKb.map((e) => e.id));
  for (const fx of SAMPLE_KB_FIXTURES) {
    if (existingKbIds.has(fx.id)) continue;
    await addKB({ ...fx, uploaded_at: now });
  }

  // Same guard for call records. saveCallRecord is idempotent on id (it
  // replaces an existing record with the same id), but skipping the
  // overwrite keeps the call timestamps stable across toggle cycles.
  const existingCallIds = new Set(listCallRecords().map((r) => r.id));
  for (const fx of SAMPLE_CALL_FIXTURES) {
    if (existingCallIds.has(fx.id)) continue;
    // generated_at injected here (not at fixture-declaration time) so the
    // timestamp reflects the actual load, not the module's first import.
    saveCallRecord({
      ...fx,
      saved_at: now,
      date: now,
      summary: { ...fx.summary, generated_at: now },
    });
  }
}

export async function clearSampleData(): Promise<void> {
  const kbEntries = await listKB();
  for (const entry of kbEntries) {
    if (entry.id.startsWith(DEMO_KB_PREFIX)) await removeKB(entry.id);
  }
  const calls = listCallRecords();
  for (const call of calls) {
    if (call.id.startsWith(DEMO_CALL_PREFIX)) removeCallRecord(call.id);
  }
}

export async function hasSampleDataLoaded(): Promise<boolean> {
  const kbEntries = await listKB();
  if (kbEntries.some((e) => e.id.startsWith(DEMO_KB_PREFIX))) return true;
  const calls = listCallRecords();
  return calls.some((c) => c.id.startsWith(DEMO_CALL_PREFIX));
}

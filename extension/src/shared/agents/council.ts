/**
 * Agent Council: 4 agents + final vote.
 * Nothing leaves this pipeline unless the council approves.
 *
 * Pipeline:
 *   1. Retrieval: pulls relevant KB chunks
 *   2. ICP Personalization: rewrites to nearest ICP rules
 *   3. Brand Compliance: enforces Project Wingman voice + design system
 *   4. Fact / Validation, every claim must trace to KB
 *   5. Council vote: a hard fail from retrieval, ICP or brand blocks output.
 *      Validation fails closed: unsupported claims are removed from the draft,
 *      claims that cannot be located are listed and the draft is held for
 *      review, and an unreadable validator verdict marks the draft unverified.
 */

import type {
  PersonalizationInput,
  BrandAssets,
  KBEntry,
  ICPProfile,
  ICPRole,
  AgentResult,
  SlideContent,
  PipelineResult,
  ResearchBrief,
  VerificationResult,
} from "../types";
import { ICP_PROFILES } from "../constants/icp-profiles";
import { type LLMClient, makeLLMClient, resolveLLMConfig } from "./llm-client";
import { runResearch, briefToPrompt } from "./research";
import { KB_SAFETY_INSTRUCTION, kbToPromptBlock } from "./prompt-safety";

export type CouncilEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "agent"; result: AgentResult }
  | { type: "research"; brief: ResearchBrief }
  | { type: "done"; pipeline: PipelineResult }
  | { type: "error"; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchICP(role: string): ICPProfile {
  const normalized = role.toLowerCase().trim();
  const byId = ICP_PROFILES.find((p) => normalized.includes(p.role));
  if (byId) return byId;

  const keywordMap: { keywords: string[]; role: ICPRole }[] = [
    { keywords: ["finance", "cfo", "financial", "controller", "treasurer"], role: "cfo" },
    { keywords: ["cto", "chief technology", "architect"], role: "cto" },
    { keywords: ["coo", "operations", "chief operating"], role: "coo" },
    { keywords: ["vp sales", "chief revenue", "cro", "revenue"], role: "vp_sales" },
    { keywords: ["vp eng", "engineering", "platform", "devops", "sre", "finops"], role: "vp_engineering" },
    { keywords: ["ceo", "founder", "president"], role: "ceo" },
  ];
  for (const { keywords, role: r } of keywordMap) {
    if (keywords.some((k) => normalized.includes(k))) {
      const hit = ICP_PROFILES.find((p) => p.role === r);
      if (hit) return hit;
    }
  }
  // default to CFO: safest executive framing
  return ICP_PROFILES.find((p) => p.role === "cfo")!;
}

function filterKB(kb: KBEntry[], input: PersonalizationInput): KBEntry[] {
  // Only ready entries contribute text; pending entries are cited by name only.
  const ready = kb.filter((e) => e.status === "ready");

  // Stage priority, if stage is set, bias toward relevant namespaces.
  const stagePriority: Record<string, string[]> = {
    discovery: ["product_overview", "industry_pages", "case_studies"],
    tech_deep_dive: ["security_compliance", "battlecard", "product_overview"],
    poc_scoping: ["roi_pricing", "product_overview"],
    poc_execution: ["product_overview", "security_compliance"],
    poc_review: ["roi_pricing", "case_studies"],
    commercial_close: ["roi_pricing", "case_studies", "battlecard"],
  };
  const preferred = input.meeting_stage ? stagePriority[input.meeting_stage] ?? [] : [];

  return ready.sort((a, b) => {
    const ai = preferred.indexOf(a.namespace);
    const bi = preferred.indexOf(b.namespace);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Rank KB entries by keyword overlap with a query string before slicing,
// so the most relevant sources make it into the LLM context window instead
// of whichever 20 happen to be at the top of the insertion-order list.
function rankKBByQuery(kb: KBEntry[], query: string): KBEntry[] {
  if (!query.trim()) return kb;
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (!terms.length) return kb;
  return [...kb].sort((a, b) => {
    const scoreEntry = (e: KBEntry) => {
      const haystack = `${e.name} ${e.content ?? ""}`.toLowerCase();
      return terms.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
    };
    return scoreEntry(b) - scoreEntry(a);
  });
}

function summarizeKB(kb: KBEntry[], query?: string): string {
  // KB content is wrapped in <kb_source> tags + sanitized. Pair with
  // KB_SAFETY_INSTRUCTION in every agent's system prompt. Closes #11.
  const ranked = query ? rankKBByQuery(kb, query) : kb;
  return kbToPromptBlock(ranked, { limit: 20, perEntryChars: 1500 });
}

export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // Handle array-root responses like [{...}]: common from Groq/OpenRouter free models.
  // Unwrap the first element if it matches the expected shape.
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = arrayStart; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          try {
            const arr = JSON.parse(text.slice(arrayStart, i + 1));
            if (Array.isArray(arr) && arr.length > 0) candidates.push(JSON.stringify(arr[0]));
          } catch { /* not valid JSON */ }
          break;
        }
      }
    }
  }

  // Balanced-brace scan for object-root responses.
  if (objectStart !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = objectStart; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(objectStart, i + 1));
          break;
        }
      }
    }
  }

  for (const raw of candidates) {
    try { return JSON.parse(raw) as T; } catch { /* try next */ }
  }
  return null;
}

async function callLLM(
  client: LLMClient,
  system: string,
  user: string,
  maxTokens = 3000,
): Promise<string> {
  return client.call(system, user, maxTokens);
}

// ─── Agent 1: Retrieval ──────────────────────────────────────────────────────

interface RetrievalOutput {
  relevant_source_ids: string[];
  citations: { source_id: string; quote: string; claim: string }[];
  missing_info: string[];
}

async function retrievalAgent(
  client: LLMClient,
  input: PersonalizationInput,
  kb: KBEntry[],
  brief?: ResearchBrief,
): Promise<AgentResult> {
  const filtered = filterKB(kb, input);

  if (!filtered.length) {
    return {
      agent: "retrieval",
      status: "fail",
      output: { relevant_source_ids: [], citations: [], missing_info: ["KB is empty"] } as RetrievalOutput,
      issues: ["No ready KB entries. Admin/PMM/Designer must populate the KB before generation."],
    };
  }

  const system = `You are the Retrieval Agent for Project Wingman's sales council. Identify the KB sources that directly support a personalized deck for this target. Output strict JSON only. ${KB_SAFETY_INSTRUCTION}`;
  const user = `TARGET:
- Company: ${input.company_name}
- Persona: ${input.persona_role}
- Deal size: ${input.deal_size}
- Stage: ${input.meeting_stage ?? "discovery"}
- Clouds: ${input.clouds?.join(", ") ?? "all three"}
- Region: ${input.region ?? "n/a"}
- Competitor: ${input.competitor ?? "n/a"}
- Pain points: ${input.pain_points ?? "n/a"}
${brief ? `\nPROSPECT RESEARCH:\n${briefToPrompt(brief)}\n` : ""}
KB:
${summarizeKB(filtered, `${input.company_name} ${input.pain_points ?? ""} ${input.competitor ?? ""}`)}

Return JSON:
{
  "relevant_source_ids": ["id1", "id2"],
  "citations": [{"source_id": "id1", "quote": "exact quote", "claim": "what it supports"}],
  "missing_info": ["what the KB does not cover for this target"]
}`;

  const text = await callLLM(client, system, user, 800);
  const parsed = extractJson<RetrievalOutput>(text) ?? {
    relevant_source_ids: filtered.slice(0, 5).map((e) => e.id),
    citations: [],
    missing_info: ["parser fallback"],
  };

  const status = parsed.citations.length > 0 ? "pass" : "warning";
  return {
    agent: "retrieval",
    status,
    output: parsed,
    issues: status === "warning" ? ["No explicit citations extracted"] : undefined,
  };
}

// ─── Agent 2: ICP Personalization ────────────────────────────────────────────

interface DraftOutput {
  slides: SlideContent[];
  matched_icp: ICPRole;
}

async function icpPersonalizationAgent(
  client: LLMClient,
  input: PersonalizationInput,
  kb: KBEntry[],
  retrieval: RetrievalOutput,
  brandAssets: BrandAssets,
  brief?: ResearchBrief,
): Promise<AgentResult & { draft: DraftOutput }> {
  const icp = matchICP(input.persona_role);
  const usedSources = kb.filter((e) => retrieval.relevant_source_ids.includes(e.id));

  const format = input.pitch_format ?? "on_screen_ppt";
  const customHint = input.pitch_format_custom_hint?.trim();
  const formatDirective: Record<string, string> = {
    on_screen_ppt:
      "Output is for an on-screen slide deck projected during a live call. Every slide has a 6-word max headline, 3 short bullet lines, and a single takeaway. No dense paragraphs, a reader must absorb each slide in under 5 seconds.",
    one_pager:
      "Output is a single one-pager executive summary. Produce 4 tight sections (Problem, Why us, Proof, Next step). Each section is 2-3 sentences, scannable in 60 seconds, no bullet lists.",
    detailed_doc:
      "Output is a long-form doc with named sections: Context, Pain, Solution, Differentiators, Evidence, Implementation, Commercials, Next Steps. Paragraphs are allowed. Cite KB source_ids inline.",
    analysis:
      "Output is a data-led analysis. Lead with a headline metric. Include tables / pills of comparisons, an ROI calculation if inputs allow, competitive positioning vs the named competitor, and a risk section. No marketing puffery.",
    custom_doc: customHint
      ? `Output is a CUSTOM DOC. The user described it as: "${customHint}". Match that doc shape exactly, infer section headings, length, tone, and structure from that description. Use the persona, KB hits, and any prospect research as supporting evidence.`
      : "Output is a CUSTOM DOC and the user did NOT describe it. AUTO-DETECT the right shape from the surrounding context: persona role, deal size, meeting stage, prospect research signals, and KB namespaces present. Pick ONE concrete shape (e.g. RFP response, security questionnaire reply, partner brief, exec memo, technical proposal) and execute it well. State the inferred shape in the first slide title.",
  };

  const system = `You are the ICP Personalization Agent. Draft a ${icp.label}-tailored deck grounded ONLY in the cited sources. Do NOT invent product facts, certifications, customer logos, savings figures, or quotes. Every factual and numeric claim must trace to a cited source; if the sources do not support a claim, omit it rather than approximating.

FORMAT: ${format.replace(/_/g, " ")}. ${formatDirective[format]}

${KB_SAFETY_INSTRUCTION}`;

  const user = `ICP: ${icp.label}
Lead with: ${icp.content_rules.lead_with.join(", ")}
Avoid: ${icp.content_rules.avoid.join(", ")}
Tone: ${icp.content_rules.tone}

TARGET: ${input.company_name}, persona "${input.persona_role}"
Stage: ${input.meeting_stage ?? "discovery"} · Deal: ${input.deal_size} · Clouds: ${input.clouds?.join(", ") ?? "AWS+GCP+Azure"}
Region: ${input.region ?? "n/a"} · Competitor: ${input.competitor ?? "n/a"}
Pain points: ${input.pain_points ?? "(none provided, infer from industry)"}
Desired format: ${format.replace(/_/g, " ")}${customHint ? `\nCustom doc hint: ${customHint}` : ""}

Brand accent (target): ${brandAssets.primary_color}
${brief ? `\nPROSPECT RESEARCH (use this to personalize, pattern-match to their actual tech stack / pain signals):\n${briefToPrompt(brief)}\n` : ""}
SOURCES (use ONLY these: cite source_id on each claim):
${summarizeKB(usedSources)}

Output JSON (COMPACT, every character counts, keep content tight):
{
  "slides": [
    {
      "index": 0,
      "title": "...",
      "components": [{"type": "text_block", "content": "..."}],
      "speaker_notes": "..."
    }
  ]
}

Produce 3 slides. Keep each slide title ≤10 words, content ≤50 words, speaker_notes ≤25 words. Every numeric claim must cite a source_id.`;

  const text = await callLLM(client, system, user, 1800);
  const parsed = extractJson<{ slides: SlideContent[] }>(text);

  if (!parsed?.slides?.length) {
    return {
      agent: "icp_personalization",
      status: "fail",
      output: { error: "no slides parsed" },
      issues: ["Could not parse draft slides from ICP agent"],
      draft: { slides: [], matched_icp: icp.role },
    };
  }

  return {
    agent: "icp_personalization",
    status: "pass",
    output: { slide_count: parsed.slides.length, matched_icp: icp.role },
    draft: { slides: parsed.slides, matched_icp: icp.role },
  };
}

// ─── Agent 3: Brand Compliance ───────────────────────────────────────────────

interface BrandCheck {
  pass: boolean;
  violations: { slide_index: number; issue: string; severity: "low" | "medium" | "high" }[];
  tone_score: number;
}

/** Parse the brand agent's reply. Returns null unless it has the expected shape. */
export function parseBrandCheck(text: string): BrandCheck | null {
  const parsed = extractJson<Partial<BrandCheck>>(text);
  if (!parsed || typeof parsed.pass !== "boolean" || !Array.isArray(parsed.violations)) return null;
  return { pass: parsed.pass, violations: parsed.violations, tone_score: Number(parsed.tone_score) || 0 };
}

async function brandComplianceAgent(
  client: LLMClient,
  draft: DraftOutput,
  kb: KBEntry[],
): Promise<AgentResult> {
  const brandVoice = kb.filter((e) => e.namespace === "brand_voice" && e.status === "ready");
  const designSystem = kb.filter((e) => e.namespace === "design_system" && e.status === "ready");

  const guidance = [
    ...brandVoice.map((e) => `BRAND VOICE (${e.name}):\n${e.content.slice(0, 2000)}`),
    ...designSystem.map((e) => `DESIGN SYSTEM (${e.name}):\n${e.content.slice(0, 2000)}`),
  ].join("\n\n");

  // Voice guidance only. It must not carry product facts: any number here would
  // reach the model with no source behind it, which is exactly what the
  // validation agent exists to reject.
  const fallbackVoice = `Project Wingman voice: direct, specific, no hype. Avoid "revolutionary", "game-changing", "best-in-class", "world-class", "synergy", "cutting-edge". Prefer a concrete sourced number over an adjective, and if the sources do not contain the number, leave it out entirely.`;

  const system = `You are the Brand Compliance Agent. Check the draft against Project Wingman voice and design system. Output strict JSON. ${KB_SAFETY_INSTRUCTION}`;
  const user = `GUIDANCE:
${guidance || fallbackVoice}

DRAFT:
${JSON.stringify(draft.slides, null, 2)}

Return JSON:
{
  "pass": true,
  "violations": [{"slide_index": 0, "issue": "...", "severity": "low"}],
  "tone_score": 0.0
}

tone_score is 0–1. Flag any banned words, invented customer names, or off-brand tone.`;

  const text = await callLLM(client, system, user, 1500);
  const parsed = parseBrandCheck(text);

  // Fail closed: an unreadable verdict is not a pass. It does not block the
  // draft (the brand check is advisory), but it is reported as not compliant.
  if (!parsed) {
    return {
      agent: "brand_compliance",
      status: "warning",
      output: { parsed: false },
      issues: ["Brand check output could not be read, so brand compliance is not verified"],
    };
  }

  const highSeverity = parsed.violations.filter((v) => v.severity === "high");
  const status =
    highSeverity.length > 0 ? "fail" : parsed.violations.length > 0 || !parsed.pass ? "warning" : "pass";
  const issues = parsed.violations.map((v) => `slide ${v.slide_index}: ${v.issue} (${v.severity})`);
  if (!parsed.pass && issues.length === 0) issues.push("Brand check did not pass and named no violations");

  return {
    agent: "brand_compliance",
    status,
    output: parsed,
    issues,
  };
}

// ─── Agent 4: Fact / Validation ──────────────────────────────────────────────

export interface FactCheck {
  grounded: boolean;
  claims: { slide_index: number; claim: string; source_id: string | null; status: "verified" | "unverified" | "hallucinated" }[];
  hallucinations: string[];
}

/**
 * Parse the validator's reply. Returns null unless it has the expected shape,
 * so a truncated or malformed verdict can never be read as "grounded".
 */
export function parseFactCheck(text: string): FactCheck | null {
  const parsed = extractJson<Partial<FactCheck>>(text);
  if (!parsed || typeof parsed.grounded !== "boolean" || !Array.isArray(parsed.claims)) return null;
  const claims = parsed.claims.filter(
    (c): c is FactCheck["claims"][number] => !!c && typeof c.claim === "string" && typeof c.status === "string",
  );
  const hallucinations = Array.isArray(parsed.hallucinations)
    ? parsed.hallucinations.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : [];
  return { grounded: parsed.grounded, claims, hallucinations };
}

// Sentence boundaries: ".", "!" or "?" followed by whitespace or the end, or a
// newline (bullets). A "." inside "2.5x" or "v1.2" is not a boundary.
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const end =
      c === "\n" || ((c === "." || c === "!" || c === "?") && (i + 1 === text.length || /\s/.test(text[i + 1])));
    if (end) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$.]+/g, " ").trim();

// Numbers, percentages, money and multipliers: "40%", "$2.5M", "3x", "1,200".
function numericTokens(s: string): string[] {
  return (s.match(/[$€£]?\d[\d,.]*\s*(?:%|x\b|k\b|m\b|b\b|bn\b)?/gi) ?? [])
    .map((t) => t.toLowerCase().replace(/\s+/g, "").replace(/[.,]$/, ""));
}

/**
 * True when `sentence` is the place the flagged `claim` was made. With
 * `anyNumber`, a sentence repeating any one of the claim's numbers matches
 * too: used for speaker notes, which tend to echo a figure ("lead with the
 * 40%") without restating the claim.
 */
function sentenceMatchesClaim(sentence: string, claim: string, anyNumber = false): boolean {
  const ns = normalize(sentence);
  const nc = normalize(claim);
  if (!nc || !ns) return false;
  if (ns.includes(nc)) return true;
  // The validator often paraphrases. A claim that carries numbers matches a
  // sentence that states every one of those numbers.
  const nums = numericTokens(claim);
  if (!nums.length) return false;
  const sentNums = numericTokens(sentence);
  return anyNumber ? nums.some((n) => sentNums.includes(n)) : nums.every((n) => sentNums.includes(n));
}

/** Remove sentences matching `claim`. Returns the new text and whether anything was removed. */
function redactText(text: string, claim: string, anyNumber = false): { text: string; removed: boolean } {
  const sentences = splitSentences(text);
  const kept = sentences.filter((s) => !sentenceMatchesClaim(s, claim, anyNumber));
  if (kept.length === sentences.length) return { text, removed: false };
  return { text: kept.join("").replace(/\n{3,}/g, "\n\n").trim(), removed: true };
}

/**
 * Apply the validator's verdict to the draft. Pure: no LLM, no I/O.
 *
 *  - no readable verdict          -> "unverified", slides unchanged
 *  - every flagged claim located
 *    in body text and removed     -> "redacted" (or "verified" if none flagged)
 *  - any flagged claim not found,
 *    or found only in a title     -> "needs_review", claims listed
 *  - grounded:false with nothing
 *    listed                       -> "needs_review"
 *
 * `supported` / `total` count the claims the validator itemised; they are
 * the only confidence figure the council reports.
 */
export function applyFactCheck(slides: SlideContent[], check: FactCheck | null): {
  slides: SlideContent[];
  verification: VerificationResult;
} {
  if (!check) {
    return {
      slides,
      verification: { status: "unverified", supported: 0, total: 0, removed_claims: [], unresolved_claims: [] },
    };
  }

  const total = check.claims.length;
  const supported = check.claims.filter((c) => c.status === "verified").length;

  // Every claim the validator did not mark verified, plus free-text
  // hallucination notes that are not already one of those claims.
  const flagged: { claim: string; slide_index: number | null }[] = check.claims
    .filter((c) => c.status !== "verified")
    .map((c) => ({ claim: c.claim, slide_index: Number.isInteger(c.slide_index) ? c.slide_index : null }));
  for (const h of check.hallucinations) {
    if (!flagged.some((f) => normalize(f.claim) === normalize(h))) flagged.push({ claim: h, slide_index: null });
  }

  const out: SlideContent[] = slides.map((s) => ({
    ...s,
    components: (s.components ?? []).map((c) => ({ ...c })),
  }));
  const removed: string[] = [];
  const unresolved: string[] = [];

  for (const f of flagged) {
    const targets = f.slide_index !== null && out[f.slide_index] ? [out[f.slide_index]] : out;
    let hit = false;
    let unremovable = false;
    for (const slide of targets) {
      if (sentenceMatchesClaim(slide.title ?? "", f.claim)) unremovable = true;
      for (const comp of slide.components) {
        if (typeof comp.content === "string") {
          const r = redactText(comp.content, f.claim);
          if (r.removed) { comp.content = r.text; hit = true; }
        } else if (comp.content != null && sentenceMatchesClaim(JSON.stringify(comp.content), f.claim)) {
          unremovable = true; // structured content we cannot safely edit: same treatment as a title
        }
      }
      if (slide.speaker_notes) {
        // Notes only count as a hit for an exact match; an echoed number is
        // cleaned up once the claim itself has been found and removed.
        const r = redactText(slide.speaker_notes, f.claim);
        if (r.removed) { slide.speaker_notes = r.text; hit = true; }
      }
    }
    if (hit) {
      for (const slide of targets) {
        if (slide.speaker_notes) slide.speaker_notes = redactText(slide.speaker_notes, f.claim, true).text;
      }
    }
    for (const slide of targets) {
      slide.components = slide.components.filter((c) => typeof c.content !== "string" || c.content.trim() !== "");
    }
    if (hit && !unremovable) removed.push(f.claim);
    else unresolved.push(f.claim);
  }

  let status: VerificationResult["status"];
  if (unresolved.length > 0) status = "needs_review";
  else if (removed.length > 0) status = "redacted";
  else if (!check.grounded) status = "needs_review";
  else status = "verified";

  return {
    slides: out,
    verification: { status, supported, total, removed_claims: removed, unresolved_claims: unresolved },
  };
}

async function validationAgent(
  client: LLMClient,
  draft: DraftOutput,
  kb: KBEntry[],
  retrieval: RetrievalOutput,
): Promise<AgentResult & { slides: SlideContent[]; verification: VerificationResult }> {
  const usedSources = kb.filter((e) => retrieval.relevant_source_ids.includes(e.id));

  const system = `You are the Fact Validation Agent. Audit every numeric and named claim in the draft. Mark "hallucinated" for any claim not supported by the cited sources. Quote each claim exactly as it appears in the draft. Output strict JSON. ${KB_SAFETY_INSTRUCTION}`;
  const user = `SOURCES (ground truth):
${summarizeKB(usedSources)}

The SOURCES above are the ONLY ground truth. There is no allowlist of claims that
bypass this check: a validator that carries its own facts is not a validator.
Certifications, compliance standards, savings percentages and pricing terms are
claims like any other, and are "hallucinated" unless a cited source states them.

DRAFT:
${JSON.stringify(draft.slides, null, 2)}

Return JSON:
{
  "grounded": true,
  "claims": [{"slide_index": 0, "claim": "exact text from the draft", "source_id": "...", "status": "verified"}],
  "hallucinations": ["exact text of any fabricated claim"]
}`;

  const text = await callLLM(client, system, user, 2000);
  const { slides, verification } = applyFactCheck(draft.slides, parseFactCheck(text));

  const issues: Record<VerificationResult["status"], string[]> = {
    verified: [],
    redacted: verification.removed_claims.map((c) => `Removed unsupported claim: ${c}`),
    needs_review: verification.unresolved_claims.length
      ? verification.unresolved_claims.map((c) => `Unsupported claim left in draft: ${c}`)
      : ["Validator marked the draft ungrounded without naming the claims"],
    unverified: ["Validator output could not be read, so no claim in this draft is verified"],
  };
  return {
    agent: "validation",
    status: verification.status === "verified" ? "pass" : verification.status === "redacted" ? "warning" : "fail",
    output: verification,
    issues: issues[verification.status],
    confidence: verification.total > 0 ? verification.supported / verification.total : undefined,
    slides,
    verification,
  };
}

// ─── Council Orchestrator ─────────────────────────────────────────────────────

// Single-pass council (4 LLM calls total: retrieval → ICP → brand → validation).
// There is no retry loop: instead of regenerating until the validator is happy,
// the draft is redacted or held for review (see applyFactCheck).

export async function* runCouncil(opts: {
  input: PersonalizationInput;
  brandAssets: BrandAssets;
  kb: KBEntry[];
  modelOverride?: { provider: import("./llm-client").LLMProvider; model: string };
  deepResearch?: boolean;
}): AsyncGenerator<CouncilEvent> {
  const { input, brandAssets, kb, modelOverride, deepResearch } = opts;
  const cfg = resolveLLMConfig(modelOverride);
  if ("error" in cfg) {
    yield { type: "error", message: cfg.error };
    return;
  }
  const client = makeLLMClient(cfg);

  try {
    // 0. Optional deep research
    let brief: ResearchBrief | undefined;
    if (deepResearch) {
      yield { type: "stage", stage: "research", message: "Researching the prospect…" };
      try {
        const { brief: b } = await runResearch({
          client,
          companyName: input.company_name,
          domainOverride: brandAssets.domain,
        });
        brief = b;
        yield { type: "research", brief: b };
      } catch (err) {
        // Non-fatal: continue without brief
        yield { type: "stage", stage: "research", message: `Research skipped: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // 1. Retrieval
    yield { type: "stage", stage: "retrieval", message: "Retrieving KB sources…" };
    const retrieval = await retrievalAgent(client, input, kb, brief);
    yield { type: "agent", result: retrieval };
    if (retrieval.status === "fail") {
      yield { type: "error", message: retrieval.issues?.[0] ?? "Retrieval failed" };
      return;
    }
    const retrievalOutput = retrieval.output as RetrievalOutput;

    // 2. ICP personalization
    yield { type: "stage", stage: "icp_personalize", message: "Drafting for persona…" };
    const icpResult = await icpPersonalizationAgent(client, input, kb, retrievalOutput, brandAssets, brief);
    yield { type: "agent", result: icpResult };
    if (icpResult.status === "fail") {
      yield { type: "error", message: "ICP agent could not produce a draft" };
      return;
    }
    const draft: DraftOutput = icpResult.draft;

    // 3. Brand compliance
    yield { type: "stage", stage: "brand_check", message: "Checking Project Wingman brand compliance…" };
    const brandResult = await brandComplianceAgent(client, draft, kb);
    yield { type: "agent", result: brandResult };

    // 4. Validation
    yield { type: "stage", stage: "validation", message: "Validating every claim against KB…" };
    const validationResult = await validationAgent(client, draft, kb, retrievalOutput);
    yield { type: "agent", result: validationResult };

    // 5. Council vote
    yield { type: "stage", stage: "generating", message: "Council vote…" };

    const { verification } = validationResult;
    const agents: AgentResult[] = [retrieval, icpResult, brandResult, validationResult];
    // Retrieval, ICP and brand block on a hard fail. Validation does not block
    // here: its verdict travels with the draft as `verification`, the UI shows
    // it, and only a "verified" or "redacted" draft is auto-written to a doc.
    const blocking = [retrieval, icpResult, brandResult];
    const councilPass = blocking.every((a) => a.status !== "fail");

    if (!councilPass) {
      const issues = blocking.flatMap((a) => a.issues ?? []);
      // Instructive error (voice.md): keep "council" (differentiator), name
      // the fix. Most council failures are an empty/thin KB for this topic.
      const detail = issues.slice(0, 3).join("; ");
      yield {
        type: "error",
        message: `The council couldn't ground a draft, add a KB entry covering this, then retry.${detail ? ` (${detail})` : ""}`,
      };
      return;
    }

    const slides = validationResult.slides;
    const pipeline: PipelineResult = {
      request_id: `council-${Date.now()}`,
      agents,
      final_output: {
        slides,
        renderable_text: slides
          .map((s, i) =>
            `Slide ${i + 1}: ${s.title}\n${"─".repeat(40)}\n${
              s.components
                ?.map((c) => (typeof c.content === "string" ? c.content : JSON.stringify(c.content)))
                .join("\n") ?? ""
            }`,
          )
          .join("\n\n"),
        structured_json: { slides, brand_assets: brandAssets, matched_icp: draft.matched_icp },
      },
      metadata: {
        sources_used: retrievalOutput.relevant_source_ids,
        brand_compliant: brandResult.status === "pass",
        verification,
        generated_at: new Date().toISOString(),
      },
    };

    yield { type: "done", pipeline };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

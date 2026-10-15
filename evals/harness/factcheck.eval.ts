/**
 * ClientLens fact-check eval. Runs the real runCouncil() with the real validation
 * prompt, parseFactCheck(), applyFactCheck(), council vote and checkWritePayload().
 *
 * Eval-only stand-in for llm-client: retrieval, ICP drafting and brand are canned
 * (retrieval returns every KB id, the "draft" is the planted test deck, brand passes),
 * so the only live model call per deck is the Fact Validation Agent, sent through
 * the Claude Code CLI with the app's configured Anthropic model.
 *
 * Run: bun test ./evals/harness/factcheck.eval.ts --timeout 1800000
 */
import { mock, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CALL_LOG, EVAL_CTX, callClaude } from "./claude-cli.mjs";

const EXT = resolve(import.meta.dir, "../../extension/src/shared");
const MODEL = process.env.EVAL_MODEL ?? "claude-opus-4-7"; // ANTHROPIC_MODEL in llm-client.ts
const DS = JSON.parse(readFileSync(resolve(import.meta.dir, "../datasets/factcheck.json"), "utf8"));

mock.module(resolve(EXT, "agents/llm-client.ts"), () => ({
  resolveLLMConfig: () => ({ provider: "anthropic", apiKey: "", model: MODEL }),
  makeLLMClient: (cfg: { model: string }) => ({
    async call(system: string, user: string) {
      const ctx = EVAL_CTX.getStore() as any;
      if (system.startsWith("You are the Retrieval Agent")) {
        return JSON.stringify({ relevant_source_ids: DS.kb.map((k: any) => k.id), citations: [{ source_id: DS.kb[0].id, quote: "Lumora Ledger", claim: "product" }], missing_info: [] });
      }
      if (system.startsWith("You are the ICP Personalization Agent")) return JSON.stringify({ slides: ctx.slides });
      if (system.startsWith("You are the Brand Compliance Agent")) return JSON.stringify({ pass: true, violations: [], tone_score: 0.9 });
      if (system.startsWith("You are the Fact Validation Agent")) {
        const r = await callClaude({ model: cfg.model, system, messages: [{ role: "user", content: user }], label: ctx.label });
        ctx.validatorRaw = r.text;
        ctx.rec = r.rec;
        if (r.limitHit) throw new Error("CLI usage limit hit");
        if (!r.ok) throw new Error("CLI error: " + r.text.slice(0, 200));
        return r.text;
      }
      throw new Error("unexpected agent: " + system.slice(0, 60));
    },
  }),
  backendUrl: () => "",
  backendJwt: async () => "",
  embedText: async () => [],
  embedTexts: async () => [],
  EMBEDDING_DIMS: 768,
}));

const { runCouncil, parseFactCheck } = await import(resolve(EXT, "agents/council.ts"));
const { checkWritePayload } = await import(resolve(EXT, "utils/write-gate.ts"));

const kb = DS.kb.map((k: any) => ({ ...k, source_type: "text", status: "ready", uploaded_by: "eval", uploaded_by_role: "pmm", uploaded_at: "2026-10-01T00:00:00Z" }));
const toSlides = (d: any) => d.slides.map((s: any, i: number) => ({ index: i, title: s.title, components: [{ type: "text_block", content: s.body }], speaker_notes: s.notes }));
const slideText = (slides: any[]) => slides.map((s) => [s.title, ...s.components.map((c: any) => (typeof c.content === "string" ? c.content : JSON.stringify(c.content))), s.speaker_notes ?? ""].join("\n")).join("\n");

async function evalDeck(d: any) {
  const slides = toSlides(d);
  const ctx: any = { label: d.id, slides };
  return EVAL_CTX.run(ctx, async () => {
    const t0 = Date.now();
    let pipeline: any = null;
    let error: string | null = null;
    for await (const ev of runCouncil({ input: { company_name: "Brindlewood Supply", persona_role: "CFO", deal_size: "100k_1m" }, brandAssets: { primary_color: "#335577" } as any, kb })) {
      if (ev.type === "done") pipeline = ev.pipeline;
      if (ev.type === "error") error = ev.message;
    }
    const ms = Date.now() - t0;
    if (!pipeline) return { id: d.id, kind: d.kind, error, ms };
    const verification = pipeline.metadata.verification;
    const finalSlides = pipeline.final_output.slides;
    const gate = checkWritePayload({ slides: finalSlides, verification: verification.status });
    const check = parseFactCheck(ctx.validatorRaw ?? "");
    const flaggedTexts: string[] = check ? [...check.claims.filter((c: any) => c.status !== "verified").map((c: any) => c.claim), ...check.hallucinations] : [];
    const verifiedTexts: string[] = check ? check.claims.filter((c: any) => c.status === "verified").map((c: any) => c.claim) : [];
    const finalText = slideText(finalSlides);
    // Hallucinations the validator did not also itemise in claims (no slide index to act on).
    const unplaced = check ? check.hallucinations.filter((h: string) => !check.claims.some((c: any) => c.status !== "verified" && (c.claim.includes(h) || h.includes(c.claim)))) : [];
    const dupRemoved = verification.removed_claims.length - new Set(verification.removed_claims).size
      + verification.removed_claims.filter((c: string) => verification.removed_claims.includes("Removed speaker note: " + c)).length;
    const planted = (d.planted ?? []).map((p: any) => {
      const re = new RegExp(p.marker, "i");
      const caught = flaggedTexts.some((t) => re.test(t));
      const markedVerified = verifiedTexts.some((t) => re.test(t));
      const stillInFinal = re.test(finalText);
      return { ...p, caught, markedVerified, stillInFinal, inWritableOutput: gate.ok && stillInFinal };
    });
    return {
      id: d.id, kind: d.kind, expect: d.expect, ms,
      status: verification.status, writable: gate.ok,
      supported: verification.supported, total: verification.total,
      removed: verification.removed_claims, unresolved: verification.unresolved_claims, notes: verification.review_notes,
      flaggedClaims: flaggedTexts, parsedVerdict: !!check, planted, unplacedHallucinations: unplaced, duplicateRemovedEntries: dupRemoved,
      needsReviewCauses: verification.status !== "needs_review" ? [] : [
        ...(verification.review_notes.some((n: string) => /no content left/.test(n)) ? ["slide-emptied-by-redaction"] : []),
        ...verification.unresolved_claims.map((c: string) => (slides.some((s: any) => s.title.includes(c) || c.includes(s.title)) ? "claim-in-title" : "claim-not-locatable")),
        ...(verification.unresolved_claims.length === 0 && verification.review_notes.length === 0 ? ["ungrounded-without-claims"] : []),
      ],
      validatorRaw: ctx.validatorRaw, finalSlides,
    };
  });
}

test("clientlens fact-check eval", async () => {
  const only = process.env.EVAL_ONLY?.split(",");
  const decks = DS.decks.filter((d: any) => !only || only.includes(d.id));
  const started = new Date().toISOString();
  const t0 = Date.now();
  const results: any[] = new Array(decks.length);
  let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < decks.length) {
      if (CALL_LOG.some((c: any) => c.limit_hit)) throw new Error("CLI usage limit hit; stopping");
      const k = i++;
      results[k] = await evalDeck(decks[k]);
    }
  }));
  const wallMs = Date.now() - t0;

  const sup = results.filter((r) => r.kind === "supported");
  const pl = results.filter((r) => r.kind === "planted");
  const plantedClaims = pl.flatMap((r) => r.planted ?? []);
  const statusCounts: Record<string, number> = {};
  for (const r of results) statusCounts[r.status ?? "error"] = (statusCounts[r.status ?? "error"] ?? 0) + 1;
  const lat = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, p50: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], max: s[s.length - 1] }; };
  const usage = CALL_LOG.reduce((a: any, c: any) => { if (c.usage) { a.input += c.usage.input_tokens + (c.usage.cache_read_input_tokens ?? 0) + (c.usage.cache_creation_input_tokens ?? 0); a.output += c.usage.output_tokens; } return a; }, { input: 0, output: 0 });
  const summary = {
    started, wallMs, configuredModel: MODEL, modelsAnswered: [...new Set(CALL_LOG.flatMap((c: any) => c.models))],
    cliCalls: CALL_LOG.length, cliErrors: CALL_LOG.filter((c: any) => c.is_error).length, callLatencyMs: lat(CALL_LOG.map((c: any) => c.ms)), usageTotals: usage,
    decks: results.length, supportedDecks: sup.length, plantedDecks: pl.length, plantedClaims: plantedClaims.length,
    plantedCaughtByValidator: plantedClaims.filter((p: any) => p.caught).length,
    plantedMarkedVerified: plantedClaims.filter((p: any) => p.markedVerified).length,
    plantedRemovedFromDraft: plantedClaims.filter((p: any) => !p.stillInFinal).length,
    plantedInWritableOutput: plantedClaims.filter((p: any) => p.inWritableOutput).length,
    plantedDecksEndingVerified: pl.filter((r) => r.status === "verified").length,
    supportedDecksVerified: sup.filter((r) => r.status === "verified").length,
    supportedDecksWithAnyFlag: sup.filter((r) => (r.flaggedClaims?.length ?? 0) > 0).length,
    statusCounts,
    needsReviewCauses: results.flatMap((r) => r.needsReviewCauses ?? []).reduce((a: any, c: string) => ((a[c] = (a[c] ?? 0) + 1), a), {}),
    decksMeetingExpectation: results.filter((r) => (r.expect === "verified" ? r.status === "verified" : r.expect === "needs_review" ? r.status === "needs_review" : r.status !== "verified" && r.status !== undefined)).length,
    unparsedVerdicts: results.filter((r) => r.parsedVerdict === false).length,
    hallucinationsWithoutSlideIndex: results.reduce((a, r) => a + (r.unplacedHallucinations?.length ?? 0), 0),
    duplicateRemovedEntries: results.reduce((a, r) => a + (r.duplicateRemovedEntries ?? 0), 0),
    pipelineErrors: results.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error })),
  };
  const file = resolve(import.meta.dir, "../results", `${started.slice(0, 10)}-claude-cli${only ? "-partial" : ""}${process.env.EVAL_TAG ? "-" + process.env.EVAL_TAG : ""}.json`);
  writeFileSync(file, JSON.stringify({ method: "Claude Code CLI (claude -p) with the app's own validation prompt and post-processing; not the production API path", summary, results, calls: CALL_LOG }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("wrote", file);
});

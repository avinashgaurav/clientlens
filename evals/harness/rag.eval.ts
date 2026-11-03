/**
 * ClientLens retrieval eval. Answer key: evals/datasets/rag.json (committed before
 * any model call). Three arms:
 *
 *  A  Retrieval only, no model calls. Real semanticChunk, real retrieveKB (reached
 *     through the real runLiveKbAsk and runCoachAgent; the prompt they build is
 *     captured and the model call is skipped). Two retrievers:
 *       A1 lexical: the production keyword fallback, reached by making embedText
 *          throw (what happens in the app when the Gemini embed call fails).
 *       A2 offline: the production vector path (real rankChunks, real 500/240-char
 *          excerpt cut) fed by a TF-IDF stand-in embedder. NOT production: the app
 *          uses Gemini gemini-embedding-001, which is not tested here.
 *  B  Ask-KB end to end: real runLiveKbAsk with fetch shimmed to the Claude CLI.
 *     The app asks for meta-llama/llama-3.1-8b-instruct:free; the eval answers with
 *     EVAL_B_MODEL (default claude-haiku-4-5-20251001, the app's Anthropic live tier).
 *  C  Pitch council: real runCouncil; Retrieval, ICP drafter, Brand and Fact
 *     Validation all answered by EVAL_C_MODEL (default claude-opus-4-7).
 *
 * Scoring is fixed code rules only. No AI grader.
 *
 * Run: bun test ./evals/harness/rag.eval.ts --timeout 7200000
 *   EVAL_ARMS=A        (A, B, C or a comma list; default A,B,C)
 *   EVAL_RUNS=3        (runs per case for B and C)
 *   EVAL_ONLY=s01,c01  (subset; writes -partial files)
 */
import { mock, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CALL_LOG, EVAL_CTX, callClaude } from "./claude-cli.mjs";

const SRC = resolve(import.meta.dir, "../../extension/src");
const SHARED = resolve(SRC, "shared");
const DS = JSON.parse(readFileSync(resolve(import.meta.dir, "../datasets/rag.json"), "utf8"));
const ARMS = (process.env.EVAL_ARMS ?? "A,B,C").split(",").map((s) => s.trim());
const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const ONLY = process.env.EVAL_ONLY?.split(",");
const B_MODEL = process.env.EVAL_B_MODEL ?? "claude-haiku-4-5-20251001";
const C_MODEL = process.env.EVAL_C_MODEL ?? "claude-opus-4-7";
const POOL = Number(process.env.EVAL_POOL ?? 4);

// ─── Offline stand-in embedder (A2). NOT the production embedder. ────────────
const STOP = new Set("a an and are as at be by can do does for from has have how in is it its of on or our that the their this to was we what when which who will with you your".split(" "));
const tokenize = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));

// ─── Mocks: only the network edges are replaced ─────────────────────────────
const realStore = await import(resolve(SHARED, "utils/kb-vector-store.ts"));
const realRankChunks = realStore.rankChunks;
let RECORDS: any[] = [];
let VOCAB = new Map<string, number>();
let IDF: number[] = [];
function offlineEmbed(text: string): number[] {
  const v = new Array(VOCAB.size).fill(0);
  const tf = new Map<number, number>();
  for (const t of tokenize(text)) { const i = VOCAB.get(t); if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1); }
  for (const [i, n] of tf) v[i] = (1 + Math.log(n)) * IDF[i];
  return v;
}

mock.module(resolve(SHARED, "utils/kb-vector-store.ts"), () => ({
  ...realStore,
  rankChunks: realRankChunks,
  // IndexedDB is not available outside the browser: rank the in-memory records instead.
  searchChunks: async (q: number[], topK: number, ids?: string[]) => realRankChunks(RECORDS, q, topK, ids),
}));

mock.module(resolve(SHARED, "agents/llm-client.ts"), () => ({
  resolveLLMConfig: (override?: { provider: string; model: string }) => ({ provider: "anthropic", apiKey: "", model: override?.model || C_MODEL }),
  makeLLMClient: (cfg: { model: string }) => {
    const call = async (system: string, user: string) => {
      const ctx = EVAL_CTX.getStore() as any;
      if (ctx?.mode === "capture") { ctx.captured = { system, user, model: cfg.model }; throw new Error("EVAL_CAPTURED"); }
      const agent = system.match(/^You are the ([A-Za-z ]+?Agent)/)?.[1] ?? "unknown";
      const r = await callClaude({ model: C_MODEL, system, messages: [{ role: "user", content: user }], label: `${ctx?.label}:${agent}` });
      (ctx.calls ??= []).push({ agent, requestedModel: cfg.model, text: r.text });
      if (r.limitHit) throw new Error("CLI usage limit hit");
      if (!r.ok) throw new Error("CLI error: " + (r.text || r.rec.result_head).slice(0, 200));
      return r.text;
    };
    return { call, callStream: (s: string, u: string, _m: number, onDelta: any) => call(s, u).then((t) => { onDelta?.(t, t); return t; }) };
  },
  backendUrl: () => "http://eval.invalid",
  backendJwt: async () => "eval",
  embedText: async (text: string) => {
    const ctx = EVAL_CTX.getStore() as any;
    if (ctx?.retriever !== "offline") throw new Error("eval: no Gemini embedder (forces the production lexical fallback)");
    return offlineEmbed(text);
  },
  embedTexts: async (texts: string[]) => texts.map(offlineEmbed),
  EMBEDDING_DIMS: 768,
}));

// fetch is only used by runLiveKbAsk (the other paths go through makeLLMClient).
globalThis.fetch = (async (_url: string, init: any) => {
  const ctx = EVAL_CTX.getStore() as any;
  const body = JSON.parse(init.body);
  const m = body.user.match(/\n\nKB:\n([\s\S]*)\n\nJSON only\.$/);
  ctx.sent = { provider: body.provider, model: body.model, max_tokens: body.max_tokens, snippets: m ? JSON.parse(m[1]) : null };
  if (ctx.mode === "capture") return new Response(JSON.stringify({ text: '{"answer":"Not in KB.","sources":[]}' }), { status: 200 });
  const r = await callClaude({ model: B_MODEL, system: body.system, messages: [{ role: "user", content: body.user }], label: ctx.label });
  ctx.raw = r.text;
  ctx.rec = r.rec;
  if (r.limitHit) throw new Error("CLI usage limit hit");
  if (!r.ok) return new Response("cli error", { status: 502 });
  return new Response(JSON.stringify({ text: r.text }), { status: 200 });
}) as any;

const { runLiveKbAsk, runCoachAgent } = await import(resolve(SRC, "meeting-copilot/agents/live-agents.ts"));
const { runCouncil, numericTokens } = await import(resolve(SHARED, "agents/council.ts"));
const { checkWritePayload } = await import(resolve(SHARED, "utils/write-gate.ts"));
const { semanticChunk } = await import(resolve(SHARED, "utils/chunker.ts"));

// ─── KB setup ────────────────────────────────────────────────────────────────
const kb = DS.kb.map((k: any) => ({ ...k, source_type: "text", status: "ready", index_status: "ready", uploaded_by: "eval", uploaded_by_role: "pmm", uploaded_at: "2026-10-01T00:00:00Z" }));
const kbById = Object.fromEntries(kb.map((k: any) => [k.id, k]));
const chunked = kb.map((e: any) => ({ e, chunks: semanticChunk(e.content) }));
{
  const docs = chunked.flatMap((c: any) => c.chunks.map((ch: any) => tokenize(ch.text)));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  VOCAB = new Map([...df.keys()].sort().map((t, i) => [t, i]));
  IDF = [...VOCAB.keys()].map((t) => Math.log((docs.length + 1) / (df.get(t)! + 1)) + 1);
  RECORDS = chunked.map((c: any) => ({ entryId: c.e.id, namespace: c.e.namespace, name: c.e.name, updated_at: "", chunks: c.chunks.map((ch: any) => ({ text: ch.text, embedding: offlineEmbed(ch.text) })) }));
}
const chunkInfo = chunked.map((c: any) => ({ id: c.e.id, chars: c.e.content.length, chunks: c.chunks.map((ch: any) => ({ index: ch.index, chars: ch.text.length, startChar: ch.startChar, endChar: ch.endChar })) }));

const cases = DS.cases.filter((c: any) => !ONLY || ONLY.includes(c.id));
const targets = DS.pitch_targets.filter((t: any) => !ONLY || ONLY.includes(t.id));
const rx = (s: string) => new RegExp(s, "i");
const today = process.env.EVAL_DATE ?? new Date().toISOString().slice(0, 10);
const outFile = (name: string) => resolve(import.meta.dir, "../results", `${today}-rag-${name}${ONLY ? "-partial" : ""}.json`);
const session = (q: string) => ({ id: "eval", status: "active", platform: "google_meet", input: { company_name: "Brindlewood Supply", persona_role: "CFO", agenda: [] }, transcript: [{ id: "t1", speaker: "prospect", text: q, ts_start: 0, ts_end: 1000, is_final: true }], sentiment_history: [], suggestions: [], agenda: [] });

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      if (CALL_LOG.some((c: any) => c.limit_hit)) throw new Error("CLI usage limit hit; stopping");
      await fn(items[i++]);
    }
  }));
}
const lat = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? { n: s.length, p50: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], max: s[s.length - 1] } : null; };
function callStats(prefix: (l: string) => boolean) {
  const calls = CALL_LOG.filter((c: any) => prefix(c.label));
  const usage = calls.reduce((a: any, c: any) => { if (c.usage) { a.input += c.usage.input_tokens + (c.usage.cache_read_input_tokens ?? 0) + (c.usage.cache_creation_input_tokens ?? 0); a.output += c.usage.output_tokens; } return a; }, { input: 0, output: 0 });
  const cost = calls.reduce((a: number, c: any) => a + (c.cost_usd_list ?? 0), 0);
  return { cliCalls: calls.length, cliErrors: calls.filter((c: any) => c.is_error).length, modelsAnswered: [...new Set(calls.flatMap((c: any) => c.models))], callLatencyMs: lat(calls.map((c: any) => c.ms)), usageTotals: usage, costUsdReportedByCli: Math.round(cost * 10000) / 10000, calls };
}

// What a retrieval returned, scored against the answer key.
function scoreRetrieval(c: any, snippets: any[] | null) {
  const s = snippets ?? [];
  const ids = s.map((x: any) => x.id);
  const firstRank = ids.findIndex((id: string) => c.gold_entry_ids.includes(id));
  const passages = c.gold_entry_ids.map((g: string, j: number) => {
    const sub = c.gold_chunk_substr[j];
    const entryRank = ids.indexOf(g);
    const inExcerpt = s.some((x: any) => x.id === g && x.excerpt.includes(sub));
    return { entry: g, entryRetrieved: entryRank >= 0, entryRank: entryRank >= 0 ? entryRank + 1 : null, passageInExcerpt: inExcerpt };
  });
  return {
    returned: ids, returnedCount: ids.length,
    allGoldEntriesRetrieved: c.gold_entry_ids.length ? passages.every((p: any) => p.entryRetrieved) : null,
    allGoldPassagesSeen: c.gold_entry_ids.length ? passages.every((p: any) => p.passageInExcerpt) : null,
    firstGoldRank: c.gold_entry_ids.length ? (firstRank >= 0 ? firstRank + 1 : null) : null,
    passages,
  };
}

// Full-depth rank of the first chunk containing the gold passage (offline embedder only).
function offlineFullRank(c: any) {
  if (!c.gold_entry_ids.length) return null;
  const hits = realRankChunks(RECORDS, offlineEmbed(c.question), 1000);
  const r = hits.findIndex((h: any) => c.gold_entry_ids.some((g: string, j: number) => h.entryId === g && h.text.includes(c.gold_chunk_substr[j])));
  return r >= 0 ? r + 1 : null;
}

async function captureAsk(q: string, retriever: string) {
  const ctx: any = { mode: "capture", retriever, label: "A" };
  await EVAL_CTX.run(ctx, () => runLiveKbAsk(q, session(q), kb));
  return ctx.sent;
}
async function captureCoach(q: string, retriever: string) {
  const ctx: any = { mode: "capture", retriever, label: "A" };
  await EVAL_CTX.run(ctx, async () => { try { await runCoachAgent(session(q), kb); } catch (e: any) { if (e.message !== "EVAL_CAPTURED") throw e; } });
  const u: string = ctx.captured?.user ?? "";
  const m = u.match(/use these to ground specific claims\):\n([\s\S]*?)\n\nLive transcript/);
  return m ? JSON.parse(m[1]) : null;
}

// ─── Arm A ───────────────────────────────────────────────────────────────────
async function armA() {
  const rows: any[] = [];
  for (const c of cases) {
    const row: any = { id: c.id, category: c.category, answerable: c.answerable };
    for (const retriever of ["lexical", "offline"]) {
      const ask = await captureAsk(c.question, retriever);
      const coach = await captureCoach(c.question, retriever);
      row[retriever] = { askKB_k6_500: scoreRetrieval(c, ask?.snippets), coach_k4_240: scoreRetrieval(c, coach), ...(retriever === "offline" ? { fullDepthPassageRank: offlineFullRank(c) } : {}) };
      if (retriever === "lexical") row.askKBRequest = { provider: ask?.provider, model: ask?.model, max_tokens: ask?.max_tokens };
    }
    rows.push(row);
  }
  const ans = rows.filter((r) => r.answerable);
  const summ = (ret: string, key: string, cat?: string) => {
    const rs = ans.filter((r) => !cat || r.category === cat);
    return {
      cases: rs.length,
      allGoldEntriesRetrieved: rs.filter((r) => r[ret][key].allGoldEntriesRetrieved).length,
      allGoldPassagesSeen: rs.filter((r) => r[ret][key].allGoldPassagesSeen).length,
      firstGoldRankHistogram: rs.reduce((a: any, r) => { const k = String(r[ret][key].firstGoldRank ?? "none"); a[k] = (a[k] ?? 0) + 1; return a; }, {}),
      emptyRetrievals: rs.filter((r) => r[ret][key].returnedCount === 0).length,
    };
  };
  const summary: any = { cases: rows.length, answerable: ans.length, chunking: chunkInfo };
  for (const ret of ["lexical", "offline"]) for (const key of ["askKB_k6_500", "coach_k4_240"]) {
    summary[`${ret}.${key}`] = { all: summ(ret, key), ...Object.fromEntries(["single_fact", "paraphrase", "two_entry"].map((cat) => [cat, summ(ret, key, cat)])) };
  }
  summary.unanswerableEmptyRetrievals = Object.fromEntries(["lexical", "offline"].map((ret) => [ret, rows.filter((r) => !r.answerable && r[ret].askKB_k6_500.returnedCount === 0).length]));
  summary.askKBRequestedModels = [...new Set(rows.map((r) => `${r.askKBRequest.provider} / ${r.askKBRequest.model}`))];
  writeFileSync(outFile("retrieval"), JSON.stringify({ method: "Arm A: retrieval only, no model calls. Real semanticChunk, retrieveKB, lexicalFallback, rankChunks via runLiveKbAsk and runCoachAgent with the model call captured and skipped. 'offline' uses a TF-IDF stand-in embedder, NOT the production Gemini embedder.", summary, results: rows }, null, 2));
  console.log("ARM A", JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([k]) => k !== "chunking")), null, 1));
}

// ─── Arm B ───────────────────────────────────────────────────────────────────
function scoreAnswer(c: any, res: any, snippets: any[]) {
  const answer: string = res?.answer ?? "";
  const sources: any[] = Array.isArray(res?.sources) ? res.sources : [];
  const notInKB = answer.trim() === "Not in KB.";
  const quoteChecks = sources.map((s: any) => {
    const q = typeof s?.quote === "string" ? s.quote : "";
    const sameId = snippets.some((x: any) => x.id === s?.kb_entry_id && x.excerpt.includes(q));
    const anyExcerpt = snippets.some((x: any) => x.excerpt.includes(q));
    const norm = (t: string) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
    const normalized = q.length > 0 && snippets.some((x: any) => norm(x.excerpt).includes(norm(q)));
    return { kb_entry_id: s?.kb_entry_id, quote: q, exactInSameEntryExcerpt: q.length > 0 && sameId, exactInAnyExcerpt: q.length > 0 && anyExcerpt, normalizedInAnyExcerpt: normalized };
  });
  const quotesOk = quoteChecks.every((q) => q.exactInSameEntryExcerpt);
  const mustOk = c.must_contain.every((p: string) => rx(p).test(answer));
  const forbidden = c.must_not_contain.filter((p: string) => rx(p).test(answer));
  let pass: boolean;
  if (c.category === "unanswerable") pass = notInKB && sources.length === 0;
  else if (c.category === "unanswerable_denied") pass = (notInKB && sources.length === 0) || ((c.accept_denial ?? []).some((p: string) => rx(p).test(answer)) && forbidden.length === 0 && quotesOk);
  else pass = mustOk && forbidden.length === 0 && !notInKB;
  return { answer, sources: sources.length, notInKB, mustOk, forbiddenHit: forbidden, quotesOk, quoteChecks, pass };
}

async function armB() {
  const jobs = ["lexical", "offline"].flatMap((retriever) => Array.from({ length: RUNS }, (_, run) => cases.map((c: any) => ({ c, retriever, run })))).flat();
  const rows: any[] = [];
  const t0 = Date.now();
  await pool(jobs, POOL, async ({ c, retriever, run }) => {
    const ctx: any = { mode: "live", retriever, label: `B:${retriever}:${run}:${c.id}` };
    const res = await EVAL_CTX.run(ctx, () => runLiveKbAsk(c.question, session(c.question), kb));
    const snippets = ctx.sent?.snippets ?? [];
    rows.push({ id: c.id, category: c.category, answerable: c.answerable, retriever, run, retrieval: scoreRetrieval(c, snippets), requested: { provider: ctx.sent?.provider, model: ctx.sent?.model }, ...scoreAnswer(c, res, snippets), raw: ctx.raw, ms: ctx.rec?.ms, model: ctx.rec?.models });
  });
  rows.sort((a, b) => (a.retriever + a.run + a.id).localeCompare(b.retriever + b.run + b.id));
  const summary: any = { wallMs: Date.now() - t0, configuredModel: B_MODEL, runs: RUNS, appRequestedModels: [...new Set(rows.map((r) => `${r.requested.provider} / ${r.requested.model}`))] };
  for (const retriever of ["lexical", "offline"]) {
    const rs = rows.filter((r) => r.retriever === retriever);
    const ans = rs.filter((r) => r.answerable);
    const byCat = (cat: string) => { const x = rs.filter((r) => r.category === cat); return { attempts: x.length, pass: x.filter((r) => r.pass).length }; };
    const perCaseAllRuns = (pred: (r: any) => boolean) => [...new Set(rs.map((r) => r.id))].filter((id) => rs.filter((r) => r.id === id).every(pred)).length;
    summary[retriever] = {
      answerableAttempts: ans.length,
      answerableCorrect: ans.filter((r) => r.pass).length,
      answerableWithForbiddenText: ans.filter((r) => r.forbiddenHit.length).length,
      answerableWronglyNotInKB: ans.filter((r) => r.notInKB).length,
      answerableWronglyNotInKBWhenPassageWasSeen: ans.filter((r) => r.notInKB && r.retrieval.allGoldPassagesSeen).length,
      answerableCorrectWhenPassageWasSeen: `${ans.filter((r) => r.pass && r.retrieval.allGoldPassagesSeen).length} / ${ans.filter((r) => r.retrieval.allGoldPassagesSeen).length}`,
      answerableCorrectWhenPassageNotSeen: `${ans.filter((r) => r.pass && !r.retrieval.allGoldPassagesSeen).length} / ${ans.filter((r) => !r.retrieval.allGoldPassagesSeen).length}`,
      byCategory: Object.fromEntries(["single_fact", "paraphrase", "two_entry", "unanswerable", "unanswerable_denied"].map((c) => [c, byCat(c)])),
      unanswerableExactNotInKB: rs.filter((r) => !r.answerable && r.notInKB && r.sources === 0).length,
      unanswerableAttempts: rs.filter((r) => !r.answerable).length,
      deniedAnsweredWithDenial: rs.filter((r) => r.category === "unanswerable_denied" && r.pass && !r.notInKB).length,
      unanswerableWithForbiddenText: rs.filter((r) => !r.answerable && r.forbiddenHit.length).length,
      answersWithSources: rs.filter((r) => r.sources > 0).length,
      quotesTotal: rs.reduce((a, r) => a + r.quoteChecks.length, 0),
      quotesExactInSameEntryExcerpt: rs.reduce((a, r) => a + r.quoteChecks.filter((q: any) => q.exactInSameEntryExcerpt).length, 0),
      quotesExactInAnyExcerpt: rs.reduce((a, r) => a + r.quoteChecks.filter((q: any) => q.exactInAnyExcerpt).length, 0),
      quotesNormalizedInAnyExcerpt: rs.reduce((a, r) => a + r.quoteChecks.filter((q: any) => q.normalizedInAnyExcerpt).length, 0),
      unparsedAnswers: rs.filter((r) => r.answer === "No answer available." || r.answer === "Error reaching backend").length,
      casesCorrectInAllRuns: perCaseAllRuns((r) => r.pass),
      casesCorrectInNoRun: [...new Set(rs.map((r) => r.id))].filter((id) => rs.filter((r) => r.id === id).every((r) => !r.pass)),
    };
  }
  const stats = callStats((l) => l.startsWith("B:"));
  Object.assign(summary, { ...stats, calls: undefined });
  writeFileSync(outFile("askkb"), JSON.stringify({ method: `Arm B: real runLiveKbAsk (retrieveKB + KB_ASK_SYSTEM prompt + safeJson), fetch shimmed to the Claude Code CLI with ${B_MODEL}. Not the production API path; no max_tokens limit on the CLI.`, summary, results: rows, calls: stats.calls }, null, 2));
  console.log("ARM B", JSON.stringify(summary, null, 1));
}

// ─── Arm C ───────────────────────────────────────────────────────────────────
const kbNums = new Set(numericTokens(kb.map((e: any) => e.content).join("\n")));
const kbNumsVisible = new Set(numericTokens(kb.map((e: any) => e.content.slice(0, 1500)).join("\n")));
async function armC() {
  const jobs = Array.from({ length: RUNS }, (_, run) => targets.map((t: any) => ({ t, run }))).flat();
  const rows: any[] = [];
  const t0 = Date.now();
  await pool(jobs, Math.min(POOL, 3), async ({ t, run }) => {
    const ctx: any = { mode: "live", label: `C:${run}:${t.id}` };
    let pipeline: any = null; let error: string | null = null; const agents: any[] = [];
    await EVAL_CTX.run(ctx, async () => {
      for await (const ev of runCouncil({ input: t.input, brandAssets: { primary_color: "#335577" } as any, kb })) {
        if (ev.type === "agent") agents.push({ agent: ev.result.agent, status: ev.result.status, issues: ev.result.issues });
        if (ev.type === "done") pipeline = ev.pipeline;
        if (ev.type === "error") error = ev.message;
      }
    });
    const picked: string[] = (ctx.calls ?? []).length ? (() => { try { const m = (ctx.calls[0].text as string).match(/\{[\s\S]*\}/); return JSON.parse(m![0]).relevant_source_ids ?? []; } catch { return []; } })() : [];
    const sourcesUsed: string[] = pipeline?.metadata.sources_used ?? picked;
    const row: any = { id: t.id, run, error, agents, sourcesUsed, goldPicked: t.gold_source_ids.filter((g: string) => sourcesUsed.includes(g)).length, goldTotal: t.gold_source_ids.length, calls: (ctx.calls ?? []).map((c: any) => ({ agent: c.agent, requestedModel: c.requestedModel, text: c.text })) };
    if (pipeline) {
      const v = pipeline.metadata.verification;
      const slides = pipeline.final_output.slides;
      const gate = checkWritePayload({ slides, verification: v.status });
      const text = slides.map((s: any) => [s.title, ...(s.components ?? []).map((c: any) => (typeof c.content === "string" ? c.content : JSON.stringify(c.content))), s.speaker_notes ?? ""].join("\n")).join("\n");
      const inputNums = new Set(numericTokens(JSON.stringify(t.input)));
      const nums = [...new Set(numericTokens(text))];
      Object.assign(row, {
        status: v.status, writable: gate.ok, removed: v.removed_claims, unresolved: v.unresolved_claims,
        falseClaimHits: t.must_not_contain.filter((p: string) => rx(p).test(text)),
        figuresNotInKB: nums.filter((n) => !kbNums.has(n) && !inputNums.has(n)),
        figuresOnlyPast1500: nums.filter((n) => kbNums.has(n) && !kbNumsVisible.has(n)),
        finalText: text,
      });
      row.unsupportedInWritableDoc = gate.ok && (row.falseClaimHits.length > 0 || row.figuresNotInKB.length > 0);
    }
    rows.push(row);
  });
  rows.sort((a, b) => (a.run + a.id).localeCompare(b.run + b.id));
  const done = rows.filter((r) => r.status);
  const statusCounts: Record<string, number> = {};
  for (const r of rows) statusCounts[r.status ?? "error"] = (statusCounts[r.status ?? "error"] ?? 0) + 1;
  const stats = callStats((l) => l.startsWith("C:"));
  const summary = {
    wallMs: Date.now() - t0, configuredModel: C_MODEL, runs: RUNS, councils: rows.length, councilErrors: rows.filter((r) => r.error).map((r) => ({ id: r.id, run: r.run, error: r.error })),
    goldSourcesPicked: `${rows.reduce((a, r) => a + r.goldPicked, 0)} / ${rows.reduce((a, r) => a + r.goldTotal, 0)}`,
    councilsWithAllGoldPicked: rows.filter((r) => r.goldPicked === r.goldTotal).length,
    meanSourcesPicked: Math.round((rows.reduce((a, r) => a + r.sourcesUsed.length, 0) / rows.length) * 100) / 100,
    statusCounts,
    writable: done.filter((r) => r.writable).length,
    writableWithFalseClaim: done.filter((r) => r.writable && r.falseClaimHits.length).length,
    writableWithFigureNotInKB: done.filter((r) => r.writable && r.figuresNotInKB.length).length,
    unsupportedInWritableDoc: done.filter((r) => r.unsupportedInWritableDoc).length,
    anyFalseClaimInDraftOutput: done.filter((r) => r.falseClaimHits.length).length,
    ...stats, calls: undefined,
  };
  writeFileSync(outFile("council"), JSON.stringify({ method: `Arm C: real runCouncil (Retrieval, ICP drafter, Brand, Fact Validation, applyFactCheck, vote) with every agent answered through the Claude Code CLI by ${C_MODEL}; checkWritePayload decides what is writable. Not the production API path.`, summary, results: rows, calls: stats.calls }, null, 2));
  console.log("ARM C", JSON.stringify(summary, null, 1));
}

test("clientlens retrieval eval", async () => {
  if (ARMS.includes("A")) await armA();
  if (ARMS.includes("B")) await armB();
  if (ARMS.includes("C")) await armC();
});

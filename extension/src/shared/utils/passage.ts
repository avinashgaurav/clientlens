/**
 * Query-aware excerpts of KB text. Prompts carry a fixed character budget per
 * KB entry or chunk; cutting every one at its start hides facts that sit
 * further in. These helpers pick the part of the text that matches the query
 * instead, always as verbatim slices of the source cut on word boundaries.
 */

import { semanticChunk } from "./chunker";

// Common English function words. Everything else of 2+ characters counts as a
// search term, so acronyms like SSO, MFA, SOC and ERP are kept.
const STOPWORDS = new Set(
  ("a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
    "me my no not of on or our so than that the their them then there these they this to too us was we were " +
    "what when where which who whom why will with would you your yours about any all also just only some such " +
    "tell know get got let lets ok okay yes yeah").split(" "),
);

/** Lowercased, de-duplicated search terms of a query (stopwords dropped). */
export function queryTerms(query: string): string[] {
  // Letters, combining marks and digits in any script, so "café" and Hindi
  // words (whose vowel signs are combining marks) survive as whole terms.
  const terms = query.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(terms)];
}

// Terms of 3 characters or fewer match whole words only ("sso" must not hit
// "lesson"); longer terms match as substrings, so "invoice" also finds "invoices".
// Terms hold only letters, marks and digits, so they need no regex escaping.
function termPattern(term: string): RegExp {
  return term.length <= 3
    ? new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${term}(?![\\p{L}\\p{M}\\p{N}])`, "gu")
    : new RegExp(term, "gu");
}

/** How many distinct terms occur in text. */
export function countTermHits(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  return terms.reduce((n, t) => {
    const re = termPattern(t);
    return n + (re.test(hay) ? 1 : 0);
  }, 0);
}

interface Match { term: number; start: number; end: number }

function findMatches(text: string, terms: string[]): Match[] {
  const hay = text.toLowerCase();
  const out: Match[] = [];
  terms.forEach((t, term) => {
    for (const m of hay.matchAll(termPattern(t))) out.push({ term, start: m.index, end: m.index + m[0].length });
  });
  return out;
}

/** For each index, the last space or newline at or before it (-1 if none). */
function lastBreaks(text: string): Int32Array {
  const out = new Int32Array(text.length);
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " " || text[i] === "\n") last = i;
    out[i] = last;
  }
  return out;
}

/** End of a window that starts at `start`: at most maxChars on, cut at a word boundary. */
function windowEnd(text: string, start: number, maxChars: number, breaks?: Int32Array): number {
  const limit = start + maxChars;
  if (limit >= text.length) return text.length;
  if (/\s/.test(text[limit])) return limit;
  const at = breaks ? breaks[limit] : Math.max(text.lastIndexOf(" ", limit), text.lastIndexOf("\n", limit));
  return at > start ? at : limit;
}

/**
 * The window of at most maxChars that covers the most distinct query terms
 * (then the most matches). Windows open on a sentence start where possible,
 * otherwise on the matched word, and end on a word boundary. Text that fits
 * is returned whole; with no match the start of the text is returned.
 *
 * Candidate starts are visited in order with a sliding window over the
 * matches (one pointer adds matches by end, one drops them by start), so a
 * long entry costs about O(text + matches), not candidates x matches.
 */
export function bestPassage(text: string, terms: string[], maxChars: number): string {
  if (text.length <= maxChars) return text;
  const matches = terms.length ? findMatches(text, terms) : [];
  if (!matches.length) return text.slice(0, windowEnd(text, 0, maxChars)).trim();

  const sentenceStarts = new Set<number>([0]);
  for (const m of text.matchAll(/[.!?]["')\]]*\s+|\n+/g)) sentenceStarts.add(m.index + m[0].length);
  const candidates = new Set<number>(sentenceStarts);
  // Start of the word containing each match.
  let wordStart = 0;
  const byStart = [...matches].sort((a, b) => a.start - b.start);
  let scanned = 0;
  for (const m of byStart) {
    for (; scanned < m.start; scanned++) if (/\s/.test(text[scanned])) wordStart = scanned + 1;
    candidates.add(wordStart);
  }

  const ids = new Map(matches.map((m, i) => [m, i]));
  const byEnd = [...matches].sort((a, b) => a.end - b.end);
  const state = new Uint8Array(matches.length); // 0 not yet in, 1 in window, 2 dropped
  const perTerm = new Int32Array(terms.length);
  let distinct = 0;
  let total = 0;
  let drop = 0;
  let add = 0;
  const breaks = lastBreaks(text);

  let best = { start: 0, end: 0, distinct: -1, total: -1, sentence: false };
  for (const start of [...candidates].sort((a, b) => a - b)) {
    if (start >= text.length) continue;
    const end = windowEnd(text, start, maxChars, breaks);
    for (; drop < byStart.length && byStart[drop].start < start; drop++) {
      const m = byStart[drop];
      const id = ids.get(m)!;
      if (state[id] === 1) {
        total--;
        if (--perTerm[m.term] === 0) distinct--;
      }
      state[id] = 2;
    }
    for (; add < byEnd.length && byEnd[add].end <= end; add++) {
      const m = byEnd[add];
      const id = ids.get(m)!;
      if (state[id] !== 0) continue;
      state[id] = 1;
      total++;
      if (perTerm[m.term]++ === 0) distinct++;
    }
    const sentence = sentenceStarts.has(start);
    // Ties go to a sentence start, then to the later start, which puts the
    // matched sentence at the top of the window rather than at its tail.
    const better =
      distinct > best.distinct ||
      (distinct === best.distinct && total > best.total) ||
      (distinct === best.distinct && total === best.total && (sentence || !best.sentence));
    if (better) best = { start, end, distinct, total, sentence };
  }
  return text.slice(best.start, best.end).trim();
}

const GAP = "\n[...]\n";

/**
 * Fit a long KB entry into `budget` characters by keeping its most
 * query-relevant pieces. Short entries come back whole. Long ones are cut into
 * small pieces (sentence groups); the opening piece is always kept for context,
 * then the pieces matching the most query terms, emitted in source order with
 * a "[...]" marker where text was skipped.
 */
export function relevantExcerpt(content: string, query: string, budget: number): string {
  if (content.length <= budget) return content;
  const terms = queryTerms(query);
  const pieces = semanticChunk(content, { maxTokens: 60, overlapPercent: 0 });
  if (pieces.length <= 1 || !terms.length) return content.slice(0, windowEnd(content, 0, budget)).trim();

  const ranked = pieces
    .slice(1)
    .map((p) => ({ p, hits: countTermHits(p.text, terms) }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.p.index - b.p.index);

  const keep = [pieces[0]];
  let used = pieces[0].text.length;
  for (const { p } of ranked) {
    const cost = p.text.length + GAP.length;
    if (used + cost > budget) continue;
    keep.push(p);
    used += cost;
  }
  // Nothing beyond the opening matched: fall back to the plain start.
  if (keep.length === 1) return content.slice(0, windowEnd(content, 0, budget)).trim();

  keep.sort((a, b) => a.index - b.index);
  let out = keep[0].text;
  for (let i = 1; i < keep.length; i++) {
    const adjacent = keep[i].index === keep[i - 1].index + 1;
    out += (adjacent ? content.slice(keep[i - 1].endChar, keep[i].startChar) : GAP) + keep[i].text;
  }
  return out;
}

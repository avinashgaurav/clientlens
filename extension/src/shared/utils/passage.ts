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
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(terms)];
}

// Terms of 3 characters or fewer match whole words only ("sso" must not hit
// "lesson"); longer terms match as substrings, so "invoice" also finds "invoices".
function termPattern(term: string): RegExp {
  return term.length <= 3 ? new RegExp(`\\b${term}\\b`, "g") : new RegExp(term, "g");
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

/** End of a window that starts at `start`: at most maxChars on, cut at a word boundary. */
function windowEnd(text: string, start: number, maxChars: number): number {
  const limit = start + maxChars;
  if (limit >= text.length) return text.length;
  if (/\s/.test(text[limit])) return limit;
  const cut = text.lastIndexOf(" ", limit);
  const nl = text.lastIndexOf("\n", limit);
  const at = Math.max(cut, nl);
  return at > start ? at : limit;
}

/**
 * The window of at most maxChars that covers the most distinct query terms
 * (then the most matches). Windows open on a sentence start where possible,
 * otherwise on the matched word, and end on a word boundary. Text that fits
 * is returned whole; with no match the start of the text is returned.
 */
export function bestPassage(text: string, terms: string[], maxChars: number): string {
  if (text.length <= maxChars) return text;
  const matches = terms.length ? findMatches(text, terms) : [];
  if (!matches.length) return text.slice(0, windowEnd(text, 0, maxChars)).trim();

  const sentenceStarts = new Set<number>([0]);
  for (const m of text.matchAll(/[.!?]["')\]]*\s+|\n+/g)) sentenceStarts.add(m.index + m[0].length);
  const candidates = new Set<number>(sentenceStarts);
  for (const m of matches) {
    let s = m.start;
    while (s > 0 && !/\s/.test(text[s - 1])) s--;
    candidates.add(s);
  }

  let best = { start: 0, end: 0, distinct: -1, total: -1, sentence: false };
  for (const start of [...candidates].sort((a, b) => a - b)) {
    if (start >= text.length) continue;
    const end = windowEnd(text, start, maxChars);
    const inside = matches.filter((m) => m.start >= start && m.end <= end);
    const distinct = new Set(inside.map((m) => m.term)).size;
    const total = inside.length;
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

/**
 * Semantic chunker: splits raw KB text on paragraph → sentence → word
 * boundaries with a small overlap between chunks. Each chunk is a coherent
 * thought of bounded size, suitable for embedding and cosine retrieval.
 *
 * Ported from content-engine `engine/sync/chunker.ts`. Defaults tuned for
 * Groq Llama-3.3 context: ~400 tokens with 50-token (≈12.5%) overlap.
 */

export interface RawChunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

interface ChunkOptions {
  maxTokens?: number;
  overlapPercent?: number;
}

const ABBREVIATIONS = new Set([
  "Mr", "Mrs", "Ms", "Dr", "Prof", "Sr", "Jr", "St",
  "Ave", "Blvd", "Dept", "Est", "Fig", "Gen", "Gov",
  "Inc", "Ltd", "Corp", "Vol", "vs", "etc", "approx",
  "i.e", "e.g", "cf", "al", "no", "Jan", "Feb", "Mar",
  "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]);

/** Rough token estimate: words × 1.3. Good enough for chunk-size budgeting. */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

/** Split text into sentences, respecting common abbreviations and initials. */
export function splitSentences(text: string): string[] {
  return sentenceSpans(text, 0, text.length).map(([s, e]) => text.slice(s, e));
}

// A span is a [start, end) range of character offsets into the source text.
type Span = [number, number];

/** Trim whitespace off both ends of a span. Returns null if nothing is left. */
function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? [start, end] : null;
}

/** Sentence spans inside text[start, end), same rules as splitSentences. */
function sentenceSpans(text: string, start: number, end: number): Span[] {
  const spans: Span[] = [];
  let sentStart = start;
  for (let i = start; i < end; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "?" && ch !== "!") continue;
    if (ch === ".") {
      const before = text.slice(sentStart, i).trimEnd();
      const lastWord = before.split(/\s/).pop() ?? "";
      const clean = lastWord.replace(/^[("']+/, "").replace(/\.+$/, "");
      if (ABBREVIATIONS.has(clean)) continue;
      if (/^[A-Z]$/.test(clean)) continue; // initials like "J."
    }
    if (i + 1 >= end || /\s/.test(text[i + 1])) {
      const span = trimSpan(text, sentStart, i + 1);
      if (span) spans.push(span);
      sentStart = i + 1;
    }
  }
  const rest = trimSpan(text, sentStart, end);
  if (rest) spans.push(rest);
  return spans;
}

/** Token estimate for a span, same formula as estimateTokens. */
function spanTokens(text: string, [start, end]: Span): number {
  return estimateTokens(text.slice(start, end));
}

/** Split a span into runs of whole words, each under maxTokens. */
function splitOnWords(text: string, [start, end]: Span, maxTokens: number): Span[] {
  const words: Span[] = [];
  const re = /\S+/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < end) words.push([m.index, Math.min(m.index + m[0].length, end)]);

  const segments: Span[] = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const count = i - first + 1;
    if (Math.ceil(count * 1.3) > maxTokens) {
      if (count === 1) {
        segments.push(words[i]);
        first = i + 1;
      } else {
        segments.push([words[first][0], words[i - 1][1]]);
        first = i;
      }
    }
  }
  if (first < words.length) segments.push([words[first][0], words[words.length - 1][1]]);
  return segments;
}

function splitToSegments(text: string, span: Span, maxTokens: number): Span[] {
  if (spanTokens(text, span) <= maxTokens) return [span];

  const sentences = sentenceSpans(text, span[0], span[1]);
  if (sentences.length > 1) {
    const segments: Span[] = [];
    let current: Span | null = null;
    for (const sentence of sentences) {
      const grown: Span = current ? [current[0], sentence[1]] : sentence;
      if (spanTokens(text, grown) <= maxTokens) {
        current = grown;
      } else if (!current) {
        segments.push(...splitOnWords(text, sentence, maxTokens));
      } else {
        segments.push(current);
        current = spanTokens(text, sentence) <= maxTokens ? sentence : null;
        if (!current) segments.push(...splitOnWords(text, sentence, maxTokens));
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  return splitOnWords(text, span, maxTokens);
}

/** Paragraph spans: text separated by blank lines, trimmed. */
function paragraphSpans(text: string): Span[] {
  const spans: Span[] = [];
  const sep = /\n\s*\n/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(text))) {
    const span = trimSpan(text, start, m.index);
    if (span) spans.push(span);
    start = m.index + m[0].length;
  }
  const rest = trimSpan(text, start, text.length);
  if (rest) spans.push(rest);
  return spans;
}

/**
 * Where chunk `core` should start so it repeats the tail of `prev` (about
 * overlapPercent of prev). Lands on a sentence start inside the overlap if
 * there is one, else on a word start, so a chunk never opens mid-word.
 */
function overlapStart(text: string, prev: Span, core: Span, overlapPercent: number): number {
  const want = Math.floor((prev[1] - prev[0]) * (overlapPercent / 100));
  if (want <= 0) return core[0];
  const from = Math.max(prev[0], prev[1] - want);
  const sentence = sentenceSpans(text, prev[0], prev[1]).find(([s]) => s >= from);
  if (sentence) return sentence[0];
  for (let i = from; i < prev[1]; i++) {
    if (!/\s/.test(text[i]) && (i === 0 || /\s/.test(text[i - 1]))) return i;
  }
  return core[0];
}

/**
 * Split text into chunks under maxTokens, walking paragraph → sentence → word
 * boundaries and repeating a small slice of the previous chunk for context.
 * Every chunk is a verbatim slice of the source: text === source.slice(startChar,
 * endChar), and it starts and ends on a word boundary.
 */
export function semanticChunk(text: string, options?: ChunkOptions): RawChunk[] {
  const maxTokens = options?.maxTokens ?? 400;
  const overlapPercent = options?.overlapPercent ?? 12;

  const rawSegments: Span[] = [];
  for (const para of paragraphSpans(text)) {
    rawSegments.push(...splitToSegments(text, para, maxTokens));
  }

  // Merge small adjacent segments greedily so we don't end up with dozens of
  // 1-sentence chunks for short bullet-list KB entries.
  const merged: Span[] = [];
  let buffer: Span | null = null;
  for (const seg of rawSegments) {
    if (!buffer) { buffer = seg; continue; }
    const combined: Span = [buffer[0], seg[1]];
    if (spanTokens(text, combined) <= maxTokens) {
      buffer = combined;
    } else {
      merged.push(buffer);
      buffer = seg;
    }
  }
  if (buffer) merged.push(buffer);

  return merged.map((core, i) => {
    const startChar = i > 0 && overlapPercent > 0 ? overlapStart(text, merged[i - 1], core, overlapPercent) : core[0];
    const endChar = core[1];
    return { text: text.slice(startChar, endChar), index: i, startChar, endChar };
  });
}

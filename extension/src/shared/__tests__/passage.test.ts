import { describe, expect, it } from "vitest";
import { bestPassage, countTermHits, queryTerms, relevantExcerpt } from "../utils/passage";

const filler = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `The ${tag} section paragraph ${i} covers routine onboarding detail.`).join(" ");

describe("queryTerms", () => {
  it("keeps short acronyms and drops stopwords", () => {
    expect(queryTerms("Is MFA required for SSO and the ERP?")).toEqual(["mfa", "required", "sso", "erp"]);
  });

  it("keeps non-ASCII words whole", () => {
    expect(queryTerms("Café pricing? मूल्य क्या है")).toEqual(["café", "pricing", "मूल्य", "क्या", "है"]);
    expect(bestPassage(`${"x ".repeat(200)}Le café coûte 4 euros. ${"y ".repeat(200)}`, queryTerms("café"), 60)).toContain("café coûte 4 euros.");
    expect(countTermHits("हमारा मूल्य स्थिर है", queryTerms("मूल्य"))).toBe(1);
  });
});

describe("countTermHits", () => {
  it("matches short terms as whole words only", () => {
    expect(countTermHits("This lesson covers single sign-on.", ["sso"])).toBe(0);
    expect(countTermHits("SSO via SAML is included.", ["sso"])).toBe(1);
  });

  it("matches longer terms as substrings", () => {
    expect(countTermHits("Approved invoices sync nightly.", ["invoice"])).toBe(1);
  });
});

describe("bestPassage", () => {
  const text = `${filler(12, "intro")} MFA is required for every admin account. ${filler(12, "outro")}`;

  it("returns the window around the match, not the start of the text", () => {
    const out = bestPassage(text, queryTerms("Is MFA required?"), 200);
    expect(out).toContain("MFA is required for every admin account.");
    expect(out.startsWith("MFA is required")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(text).toContain(out);
  });

  it("cuts on word boundaries", () => {
    const out = bestPassage(text, queryTerms("admin account"), 120);
    const start = text.indexOf(out);
    expect(start === 0 || /\s/.test(text[start - 1])).toBe(true);
    const end = start + out.length;
    expect(end === text.length || /\s/.test(text[end])).toBe(true);
  });

  it("returns short text whole and falls back to the start with no match", () => {
    expect(bestPassage("Short.", ["zzz"], 100)).toBe("Short.");
    expect(text.startsWith(bestPassage(text, ["zzz"], 100))).toBe(true);
  });
});

describe("relevantExcerpt", () => {
  const entry = `Opening summary of the security entry. ${filler(30, "background")} Data retention and exit. Records are retained for seven years. A full data export is available within 30 days of exit. ${filler(10, "closing")}`;

  it("keeps short entries whole", () => {
    expect(relevantExcerpt("A short entry.", "anything", 1500)).toBe("A short entry.");
  });

  it("keeps the opening plus the parts matching the query, within budget", () => {
    const out = relevantExcerpt(entry, "data retention and a clear exit plan", 600);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.startsWith("Opening summary")).toBe(true);
    expect(out).toContain("retained for seven years");
    expect(out).toContain("30 days of exit");
    expect(out).toContain("[...]");
  });
});

// The quadratic implementation bestPassage replaced, kept to check the
// sliding-window rewrite returns exactly the same windows.
function oldBestPassage(text: string, terms: string[], maxChars: number): string {
  const windowEnd = (start: number) => {
    const limit = start + maxChars;
    if (limit >= text.length) return text.length;
    if (/\s/.test(text[limit])) return limit;
    const at = Math.max(text.lastIndexOf(" ", limit), text.lastIndexOf("\n", limit));
    return at > start ? at : limit;
  };
  if (text.length <= maxChars) return text;
  const hay = text.toLowerCase();
  const matches: { term: number; start: number; end: number }[] = [];
  terms.forEach((t, term) => {
    const re = t.length <= 3 ? new RegExp(`\\b${t}\\b`, "g") : new RegExp(t, "g");
    for (const m of hay.matchAll(re)) matches.push({ term, start: m.index, end: m.index + m[0].length });
  });
  if (!matches.length) return text.slice(0, windowEnd(0)).trim();
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
    const end = windowEnd(start);
    const inside = matches.filter((m) => m.start >= start && m.end <= end);
    const distinct = new Set(inside.map((m) => m.term)).size;
    const total = inside.length;
    const sentence = sentenceStarts.has(start);
    const better =
      distinct > best.distinct ||
      (distinct === best.distinct && total > best.total) ||
      (distinct === best.distinct && total === best.total && (sentence || !best.sentence));
    if (better) best = { start, end, distinct, total, sentence };
  }
  return text.slice(best.start, best.end).trim();
}

describe("bestPassage performance", () => {
  it("matches the old implementation on small inputs", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const vocab = ["sso", "lesson", "mfa", "invoice", "invoices", "approval", "tier", "the", "Data.", "exit!", "plan?", "x", "retention", "SSO,", "erp"];
    const seps = [" ", " ", " ", "\n", "\n\n", "  "];
    for (let n = 0; n < 400; n++) {
      const words = Array.from({ length: 20 + rnd(150) }, () => vocab[rnd(vocab.length)] + seps[rnd(seps.length)]);
      const text = words.join("");
      const terms = queryTerms(Array.from({ length: 1 + rnd(4) }, () => vocab[rnd(vocab.length)]).join(" "));
      const max = 20 + rnd(200);
      expect(bestPassage(text, terms, max)).toBe(oldBestPassage(text, terms, max));
    }
  });

  it("handles a dense ~300 KB entry quickly", () => {
    const sentence = "SSO and MFA are required for every invoice approval tier in the ERP. ";
    const text = sentence.repeat(Math.ceil(300_000 / sentence.length));
    expect(text.length).toBeGreaterThanOrEqual(300_000);
    const t0 = performance.now();
    const out = bestPassage(text, queryTerms("Is SSO or MFA required for invoice approval in the ERP?"), 500);
    const ms = performance.now() - t0;
    console.log(`bestPassage on ${text.length} chars: ${ms.toFixed(1)} ms`);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(ms).toBeLessThan(200);
  });
});

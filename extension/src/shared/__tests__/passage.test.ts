import { describe, expect, it } from "vitest";
import { bestPassage, countTermHits, queryTerms, relevantExcerpt } from "../utils/passage";

const filler = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `The ${tag} section paragraph ${i} covers routine onboarding detail.`).join(" ");

describe("queryTerms", () => {
  it("keeps short acronyms and drops stopwords", () => {
    expect(queryTerms("Is MFA required for SSO and the ERP?")).toEqual(["mfa", "required", "sso", "erp"]);
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

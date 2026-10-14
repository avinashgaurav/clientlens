import { describe, expect, it } from "vitest";
import { applyFactCheck, extractJson, parseBrandCheck, parseFactCheck, type FactCheck } from "../agents/council";
import type { SlideContent } from "../types";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it("prefers a fenced block over surrounding prose", () => {
    const text = 'Here you go:\n```json\n{"grounded": true, "claims": []}\n```\nThanks {not json}';
    expect(extractJson(text)).toEqual({ grounded: true, claims: [] });
  });

  it("finds an object after leading prose and ignores trailing prose", () => {
    expect(extractJson('Sure! {"x": "y"} hope that helps')).toEqual({ x: "y" });
  });

  it("does not stop at braces inside strings", () => {
    expect(extractJson('{"s": "a } b { c", "n": 2}')).toEqual({ s: "a } b { c", n: 2 });
  });

  it("unwraps the first element of an array-root response", () => {
    expect(extractJson('[{"k": 1}, {"k": 2}]')).toEqual({ k: 1 });
  });

  it("returns null when there is no JSON", () => {
    expect(extractJson("I could not do that.")).toBeNull();
  });

  it("returns null for truncated JSON", () => {
    expect(extractJson('{"grounded": true, "claims": [{"claim": "40%')).toBeNull();
  });
});

const draft: SlideContent[] = [
  {
    index: 0,
    title: "Why Northwind now",
    components: [
      {
        type: "text_block",
        content: "Northwind syncs notes across devices. Customers cut cloud spend by 40% in 90 days. Setup takes one day.",
      },
    ],
    speaker_notes: "Mention the 40% figure early.",
  },
  {
    index: 1,
    title: "Security",
    components: [{ type: "text_block", content: "Data is encrypted with AES-256 at rest." }],
  },
];

const check = (over: Partial<FactCheck>): FactCheck => ({ grounded: true, claims: [], hallucinations: [], ...over });

describe("parseFactCheck", () => {
  it("returns null on unparseable output", () => {
    expect(parseFactCheck("The draft looks fine to me.")).toBeNull();
  });

  it("returns null when required fields are missing, rather than defaulting to grounded", () => {
    expect(parseFactCheck('{"hallucinations": []}')).toBeNull();
    expect(parseFactCheck('{"grounded": "yes", "claims": []}')).toBeNull();
  });

  it("keeps well-formed claims and drops malformed ones", () => {
    const parsed = parseFactCheck(
      JSON.stringify({
        grounded: false,
        claims: [{ slide_index: 0, claim: "x", source_id: null, status: "hallucinated" }, { nope: true }],
        hallucinations: ["x", 4],
      }),
    );
    expect(parsed).toEqual({
      grounded: false,
      claims: [{ slide_index: 0, claim: "x", source_id: null, status: "hallucinated" }],
      hallucinations: ["x"],
    });
  });
});

describe("applyFactCheck (fails closed)", () => {
  it("marks the draft unverified when the validator output could not be parsed", () => {
    const { slides, verification } = applyFactCheck(draft, parseFactCheck("not json at all"));
    expect(verification.status).toBe("unverified");
    expect(verification.total).toBe(0);
    expect(slides).toBe(draft);
  });

  it("removes a planted unsupported number from the draft", () => {
    const { slides, verification } = applyFactCheck(
      draft,
      check({
        grounded: false,
        claims: [
          { slide_index: 0, claim: "Northwind syncs notes across devices", source_id: "kb-1", status: "verified" },
          { slide_index: 0, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" },
        ],
      }),
    );
    expect(verification.status).toBe("redacted");
    // The note echoing the removed figure is listed too, so the rep sees it.
    expect(verification.removed_claims).toEqual([
      "Customers cut cloud spend by 40% in 90 days",
      "Speaker note: Mention the 40% figure early.",
    ]);
    expect(verification).toMatchObject({ supported: 1, total: 2 });
    const body = slides[0].components[0].content as string;
    expect(body).not.toContain("40%");
    expect(body).toContain("Northwind syncs notes across devices.");
    expect(body).toContain("Setup takes one day.");
    // The speaker note repeating the number is removed too.
    expect(slides[0].speaker_notes ?? "").not.toContain("40%");
    // The input draft is not mutated.
    expect(draft[0].components[0].content).toContain("40%");
  });

  it("matches a paraphrased claim by its numbers", () => {
    const { slides, verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: 0, claim: "40% savings within 90 days", source_id: null, status: "unverified" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(slides[0].components[0].content).not.toContain("40%");
  });

  it("holds the draft for review when redaction empties a slide", () => {
    const { slides, verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: 1, claim: "encrypted with AES-256 at rest", source_id: null, status: "hallucinated" }] }),
    );
    expect(slides[1].components).toHaveLength(0);
    expect(verification.status).toBe("needs_review");
    expect(verification.review_notes).toEqual(["Slide 2 has no content left after removing unsupported claims"]);
    expect(verification.unresolved_claims).toEqual([]);
  });

  it("does not delete every sentence naming an entity (the Acme case)", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "Acme saved us time. Acme is great. Other." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Acme", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(verification.unresolved_claims).toEqual(["Acme"]);
    expect(slides[0].components[0].content).toBe("Acme saved us time. Acme is great. Other.");
  });

  it("does not auto-remove a short, figure-free claim even on a single match", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "Acme saved us time. Other." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Acme saved us", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toBe("Acme saved us time. Other.");
  });

  it("removes a single exact match of a claim of four or more words", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "Acme saved us real time. Other." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Acme saved us real time", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(slides[0].components[0].content).toBe("Other.");
  });

  it("counts matches across components and notes before removing anything", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [
          { type: "text_block", content: "Customers cut cloud spend by 40% in 90 days. Setup is guided." },
          { type: "bullet_list", content: "Customers cut cloud spend by 40% in 90 days" },
        ],
        speaker_notes: "Open with the story.",
      },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components).toHaveLength(2);
    expect(slides[0].components[0].content).toContain("40%");
    expect(slides[0].components[1].content).toContain("40%");
  });

  it("treats a claim in both body and notes as ambiguous", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [{ type: "text_block", content: "Customers cut cloud spend by 40% in 90 days. Setup is guided." }],
        speaker_notes: "Customers cut cloud spend by 40% in 90 days.",
      },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("does not call a slide empty when a table or chart remains", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [
          { type: "text_block", content: "Customers cut cloud spend by 40% in 90 days." },
          { type: "table", content: { headers: ["Plan", "Seats"], rows: [["Team", "10"]] } },
        ],
      },
    ] as SlideContent[];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(verification.review_notes).toEqual([]);
    expect(slides[0].components).toHaveLength(1);
    expect(slides[0].components[0].type).toBe("table");
  });

  it("describes a blank flagged claim instead of listing an empty string", () => {
    const { verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: 0, claim: "  ", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(verification.unresolved_claims).toEqual(["A claim on slide 1 (the validator did not quote it)"]);
  });

  it("does not report verified when the validator itemised no claims", () => {
    // The draft states "40%", so it needs a human look.
    expect(applyFactCheck(draft, check({ claims: [] })).verification.status).toBe("needs_review");
    const plain: SlideContent[] = [{ index: 0, title: "Hello", components: [{ type: "text_block", content: "We listen first." }] }];
    expect(applyFactCheck(plain, check({ claims: [] })).verification.status).toBe("unverified");
  });

  it("never sweeps the deck for a claim with no slide index", () => {
    const { slides, verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: null as unknown as number, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("treats an out-of-range slide index as unresolved", () => {
    const { verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: 9, claim: "Setup takes one day", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
  });

  it("matches short claims on word boundaries only", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "The CFO said budgets are tight. Plans start monthly." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "AI", source_id: null, status: "hallucinated" }] }),
    );
    expect(slides[0].components[0].content).toBe("The CFO said budgets are tight. Plans start monthly.");
    expect(verification.status).toBe("needs_review");
  });

  it("ignores single-digit numbers when matching a paraphrase", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "We ship 2 releases a month. Onboarding is guided." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "SOC 2 Type II certified", source_id: null, status: "hallucinated" }] }),
    );
    expect(slides[0].components[0].content).toContain("We ship 2 releases a month.");
    expect(verification.status).toBe("needs_review");
  });

  it("treats 1,200 and 1200 as the same figure", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "Trusted by 1,200 teams worldwide. Setup is guided." }] },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "used by 1200 teams", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(slides[0].components[0].content).toBe("Setup is guided.");
  });

  it("holds the draft when a paraphrase matches more than one sentence", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [{ type: "text_block", content: "Teams save 40% on spend. Spend drops 40% in the first quarter. Setup is guided." }],
      },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "a 40% reduction in spend", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("holds the draft for review when a flagged claim cannot be located", () => {
    const { verification } = applyFactCheck(
      draft,
      check({ grounded: false, hallucinations: ["SOC 2 Type II certified"] }),
    );
    expect(verification.status).toBe("needs_review");
    expect(verification.unresolved_claims).toEqual(["SOC 2 Type II certified"]);
  });

  it("holds the draft for review when the claim is in a title", () => {
    const titled: SlideContent[] = [{ index: 0, title: "Save 40% today", components: [] }];
    const { verification } = applyFactCheck(
      titled,
      check({ claims: [{ slide_index: 0, claim: "Save 40%", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("needs_review");
  });

  it("holds the draft when the validator says ungrounded but names nothing", () => {
    expect(applyFactCheck(draft, check({ grounded: false })).verification.status).toBe("needs_review");
  });

  it("reports verified only when every itemised claim is supported", () => {
    const { slides, verification } = applyFactCheck(
      draft,
      check({ claims: [{ slide_index: 1, claim: "AES-256 at rest", source_id: "kb-2", status: "verified" }] }),
    );
    expect(verification).toMatchObject({ status: "verified", supported: 1, total: 1 });
    expect(slides[1].components[0].content).toContain("AES-256");
  });

  it("does not treat a decimal point as a sentence boundary", () => {
    const s: SlideContent[] = [
      { index: 0, title: "t", components: [{ type: "text_block", content: "We run 2.5x faster than v1.2 builds. Support is 24/7." }] },
    ];
    const { slides } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "2.5x faster", source_id: null, status: "hallucinated" }] }),
    );
    expect(slides[0].components[0].content).toBe("Support is 24/7.");
  });
});

describe("parseBrandCheck", () => {
  it("returns null on parse failure instead of a default pass", () => {
    expect(parseBrandCheck("Looks on-brand.")).toBeNull();
    expect(parseBrandCheck('{"violations": []}')).toBeNull();
  });

  it("parses a valid verdict", () => {
    expect(parseBrandCheck('{"pass": false, "violations": [], "tone_score": 0.4}')).toEqual({
      pass: false,
      violations: [],
      tone_score: 0.4,
    });
  });
});

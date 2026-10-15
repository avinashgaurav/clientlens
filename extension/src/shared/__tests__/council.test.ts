import { describe, expect, it } from "vitest";
import { applyFactCheck, extractJson, numericTokens, parseBrandCheck, parseFactCheck, type FactCheck } from "../agents/council";
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
      "Removed speaker note: Mention the 40% figure early.",
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
          { type: "comparison_table", content: { headers: ["Plan", "Seats"], rows: [["Team", "10"]] } },
        ],
      },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "Customers cut cloud spend by 40% in 90 days", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(verification.review_notes).toEqual([]);
    expect(slides[0].components).toHaveLength(1);
    expect(slides[0].components[0].type).toBe("comparison_table");
  });

  const one = (content: string, notes?: string, title = "t"): SlideContent[] => [
    { index: 0, title, components: [{ type: "text_block", content }], ...(notes ? { speaker_notes: notes } : {}) },
  ];
  const flag = (claim: string) => check({ claims: [{ slide_index: 0, claim, source_id: null, status: "hallucinated" }] });

  it("holds the draft when a paraphrase of a removed claim would survive elsewhere on the slide", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [
          { type: "text_block", content: "Reduces cloud spend by 40% in 90 days. Setup is guided." },
          { type: "bullet_list", content: "Customers cut spend 40% within 90 days" },
        ],
      },
    ];
    const { slides, verification } = applyFactCheck(s, flag("Reduces cloud spend by 40% in 90 days"));
    expect(verification.status).toBe("needs_review");
    expect(verification.unresolved_claims).toEqual(["Reduces cloud spend by 40% in 90 days"]);
    expect(slides[0].components[1].content).toContain("40%");
  });

  it("holds the draft when the notes paraphrase an exactly matched claim", () => {
    const { slides, verification } = applyFactCheck(
      one("Reduces cloud spend by 40% in 90 days. Setup is guided.", "Customers cut spend 40% within 90 days."),
      flag("Reduces cloud spend by 40% in 90 days"),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].speaker_notes).toContain("40%");
  });

  it("lists every echoed speaker note it drops", () => {
    const { slides, verification } = applyFactCheck(
      one("We cut spend by 40% for most teams. Setup is guided.", "Lead with the 40%. Pause. Repeat 40% at the close."),
      flag("We cut spend by 40% for most teams"),
    );
    expect(verification.status).toBe("redacted");
    expect(verification.removed_claims).toEqual([
      "We cut spend by 40% for most teams",
      "Removed speaker note: Lead with the 40%.",
      "Removed speaker note: Repeat 40% at the close.",
    ]);
    expect(slides[0].speaker_notes).toBe("Pause.");
  });

  it("lists an echoed speaker note once when the validator also flags it", () => {
    // From the CLI eval (deck d18): the body claim and the note sentence that
    // echoes its figure are both flagged. Echo removal takes the note first.
    const { slides, verification } = applyFactCheck(
      one("Customers see 50% lower AP costs in the first year. Setup is guided.", "Lead with the 50% lower AP costs."),
      check({
        grounded: false,
        claims: [
          { slide_index: 0, claim: "Customers see 50% lower AP costs in the first year.", source_id: null, status: "hallucinated" },
          { slide_index: 0, claim: "Lead with the 50% lower AP costs.", source_id: null, status: "hallucinated" },
        ],
      }),
    );
    expect(verification.status).toBe("redacted");
    expect(verification.removed_claims).toEqual([
      "Customers see 50% lower AP costs in the first year.",
      "Removed speaker note: Lead with the 50% lower AP costs.",
    ]);
    expect(slides[0].speaker_notes ?? "").not.toContain("50%");
  });

  it("sends a claim in a structured component to review and leaves the slide alone", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [
          { type: "text_block", content: "Customers cut cloud spend by 40% in 90 days. Setup is guided." },
          { type: "comparison_table", content: { rows: [["Customers cut cloud spend by 40% in 90 days"]] } },
        ],
      },
    ];
    const { slides, verification } = applyFactCheck(s, flag("Customers cut cloud spend by 40% in 90 days"));
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("sends a claim also in the title to review and leaves the body alone", () => {
    const { slides, verification } = applyFactCheck(
      one("Save 40% on cloud spend today. Setup is guided.", undefined, "Save 40% on cloud spend today"),
      flag("Save 40% on cloud spend today"),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("removes a single match found only in the speaker notes", () => {
    const { slides, verification } = applyFactCheck(
      one("Setup is guided.", "Customers cut cloud spend by 40% in 90 days. Then demo."),
      flag("Customers cut cloud spend by 40% in 90 days"),
    );
    expect(verification.status).toBe("redacted");
    expect(slides[0].speaker_notes).toBe("Then demo.");
    expect(slides[0].components[0].content).toBe("Setup is guided.");
  });

  it("counts a second claim in an already removed sentence as removed", () => {
    const { slides, verification } = applyFactCheck(
      one("Acme cut cloud spend by 40% and doubled release speed. Setup is guided."),
      check({
        claims: [
          { slide_index: 0, claim: "Acme cut cloud spend by 40%", source_id: null, status: "hallucinated" },
          { slide_index: 0, claim: "doubled release speed", source_id: null, status: "hallucinated" },
        ],
      }),
    );
    expect(verification.status).toBe("redacted");
    expect(verification.removed_claims).toEqual(["Acme cut cloud spend by 40%", "doubled release speed"]);
    expect(slides[0].components[0].content).toBe("Setup is guided.");
  });

  it("sends a short claim with a bare number (SOC 2, Q3, ISO 27001) to review", () => {
    for (const claim of ["SOC 2", "Q3", "ISO 27001"]) {
      const { slides, verification } = applyFactCheck(one(`We are ${claim} ready. Setup is guided.`), flag(claim));
      expect(verification.status).toBe("needs_review");
      expect(slides[0].components[0].content).toContain(claim);
    }
  });

  it("sends a weak one-figure paraphrase to review", () => {
    // One figure and one shared keyword out of several is not enough to delete on.
    const { slides, verification } = applyFactCheck(
      one("40% of teams use dashboards daily. Setup is guided."),
      flag("40% lower cloud spend for teams after migration"),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("40%");
  });

  it("treats an empty table as no content left", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [
          { type: "text_block", content: "Customers cut cloud spend by 40% in 90 days." },
          { type: "comparison_table", content: {} },
        ],
      },
    ];
    const { verification } = applyFactCheck(s, flag("Customers cut cloud spend by 40% in 90 days"));
    expect(verification.status).toBe("needs_review");
    expect(verification.review_notes).toEqual(["Slide 1 has no content left after removing unsupported claims"]);
  });

  it.each([
    ["Acme reduced cloud spend by 40% within 90 days", "Spend dropped 40% for customers."],
    ["SOC 2 Type II certified", "Independently audited to SOC 2 standards."],
    ["Acme cut costs 40%", "We save you 40% on AWS."],
  ])("holds %j for review when a loose restatement survives", (claim, restated) => {
    const { slides, verification } = applyFactCheck(one(`${claim}.\n${restated}`), flag(claim));
    expect(verification.status).toBe("needs_review");
    expect(verification.unresolved_claims).toEqual([claim]);
    expect(verification.removed_claims).toEqual([]);
    expect(slides[0].components[0].content).toContain(restated);
  });

  it.each([
    ["Acme cut costs 40% on AWS", "We run on AWS."],
    ["Acme cut costs 40% on AWS", "Acme is a FinOps platform."],
    ["Cloud costs fell 40% this year", "Cloud bills are complex."],
  ])("keeps %j redacted next to an unrelated sentence", (claim, unrelated) => {
    const { slides, verification } = applyFactCheck(one(`${claim}.\n${unrelated}`), flag(claim));
    expect(verification.status).toBe("redacted");
    expect(verification.removed_claims).toEqual([claim]);
    expect(slides[0].components[0].content).toBe(unrelated);
  });

  it("holds a claim whose name and keyword survive together", () => {
    const { verification } = applyFactCheck(
      one("Teams at Northwind halved their cloud spend last year.\nNorthwind spend is now audited monthly."),
      flag("Teams at Northwind halved their cloud spend last year"),
    );
    expect(verification.status).toBe("needs_review");
  });

  it("still holds a name-plus-keyword restatement when the name is in the title", () => {
    const { verification } = applyFactCheck(
      one("Teams at Northwind halved their cloud spend last year.\nNorthwind spend is now audited monthly.", undefined, "Why Northwind"),
      flag("Teams at Northwind halved their cloud spend last year"),
    );
    expect(verification.status).toBe("needs_review");
  });

  it("holds a restatement of a claim that opens with its company name", () => {
    const { slides, verification } = applyFactCheck(
      one("Acme cut cloud costs by half.\nAcme's platform reduced Northwind costs substantially."),
      flag("Acme cut cloud costs by half"),
    );
    expect(verification.status).toBe("needs_review");
    expect(slides[0].components[0].content).toContain("Northwind costs");
  });

  it("holds a restatement even when the name also appears in a neutral sentence", () => {
    const { verification } = applyFactCheck(
      one("Acme cut cloud costs by half. Acme is our customer. Acme's cloud costs fell sharply.", undefined, "Acme results"),
      flag("Acme cut cloud costs by half"),
    );
    expect(verification.status).toBe("needs_review");
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
      check({ claims: [{ slide_index: 0, claim: "trusted by 1200 teams", source_id: null, status: "hallucinated" }] }),
    );
    expect(verification.status).toBe("redacted");
    expect(slides[0].components[0].content).toBe("Setup is guided.");
  });

  it("holds the draft when a paraphrase matches more than one sentence", () => {
    const s: SlideContent[] = [
      {
        index: 0,
        title: "t",
        components: [{ type: "text_block", content: "Teams save 40% on spend in 90 days. Spend drops 40% in 90 days. Setup is guided." }],
      },
    ];
    const { slides, verification } = applyFactCheck(
      s,
      check({ claims: [{ slide_index: 0, claim: "a 40% reduction in spend over 90 days", source_id: null, status: "hallucinated" }] }),
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

describe("numericTokens", () => {
  it("keeps units that touch the number", () => {
    expect(numericTokens("40% of $2.5M, 3x faster, 1.2bn rows, 40 % more")).toEqual(["40%", "$2.5m", "3x", "1.2bn", "40%"]);
  });

  it("does not read a following word as a unit", () => {
    expect(numericTokens("10 M&A deals")).toEqual(["10"]);
    expect(numericTokens("in 2024 x the board")).toEqual(["2024"]);
    expect(numericTokens("10M&A")).toEqual(["10"]);
  });
});

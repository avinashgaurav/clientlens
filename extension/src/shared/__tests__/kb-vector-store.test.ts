import { describe, expect, it } from "vitest";
import { cosine, rankChunks, type StoredEntryChunks } from "../utils/kb-vector-store";

describe("cosine", () => {
  it("is 1 for parallel vectors and 0 for orthogonal ones", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("returns 0 for a zero vector instead of NaN", () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("accepts Float32Array", () => {
    expect(cosine(Float32Array.from([1, 0]), [1, 0])).toBeCloseTo(1);
  });
});

const records: StoredEntryChunks[] = [
  {
    entryId: "a",
    namespace: "product_overview",
    name: "A",
    updated_at: "",
    chunks: [
      { text: "a-east", embedding: [1, 0] },
      { text: "a-north", embedding: [0, 1] },
    ],
  },
  {
    entryId: "b",
    namespace: "case_studies",
    name: "B",
    updated_at: "",
    chunks: [{ text: "b-northeast", embedding: [1, 1] }],
  },
];

describe("rankChunks", () => {
  it("ranks chunks by cosine similarity, best first", () => {
    const hits = rankChunks(records, [1, 0.1], 3);
    expect(hits.map((h) => h.text)).toEqual(["a-east", "b-northeast", "a-north"]);
    expect(hits[0]).toMatchObject({ entryId: "a", entryName: "A", namespace: "product_overview" });
  });

  it("respects topK", () => {
    expect(rankChunks(records, [0, 1], 1).map((h) => h.text)).toEqual(["a-north"]);
  });

  it("restricts to the given entry ids", () => {
    expect(rankChunks(records, [1, 0], 5, ["b"]).map((h) => h.text)).toEqual(["b-northeast"]);
  });
});

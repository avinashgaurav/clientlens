import { describe, expect, it } from "vitest";
import { semanticChunk, splitSentences } from "../utils/chunker";

const sentence = (i: number) =>
  `Support tickets in group ${i} have a first-response target of ${i + 1} business days and are reviewed weekly.`;
// One long paragraph, the shape that used to produce a chunk opening mid-word.
const longParagraph = Array.from({ length: 40 }, (_, i) => sentence(i)).join(" ");
const multiParagraph = [
  "Short intro paragraph.",
  Array.from({ length: 25 }, (_, i) => sentence(i)).join(" "),
  "Middle note.\nWith a second line.",
  Array.from({ length: 25 }, (_, i) => sentence(i + 50)).join("\n"),
].join("\n\n");
// No sentence breaks at all: forces the word-level split.
const wordsOnly = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");

function expectWellFormed(source: string) {
  const chunks = semanticChunk(source);
  expect(chunks.length).toBeGreaterThan(1);
  chunks.forEach((c, i) => {
    expect(c.index).toBe(i);
    expect(c.text).toBe(source.slice(c.startChar, c.endChar));
    // Never opens or closes mid-word.
    expect(c.startChar === 0 || /\s/.test(source[c.startChar - 1])).toBe(true);
    expect(c.endChar === source.length || /\s/.test(source[c.endChar])).toBe(true);
    expect(c.text).toBe(c.text.trim());
  });
  // Chunks cover the whole source in order.
  expect(chunks[0].startChar).toBe(source.search(/\S/));
  expect(chunks[chunks.length - 1].endChar).toBe(source.trimEnd().length);
  for (let i = 1; i < chunks.length; i++) {
    expect(chunks[i].startChar).toBeGreaterThan(chunks[i - 1].startChar);
    // Any gap between chunks is whitespace only (a paragraph break).
    expect(source.slice(chunks[i - 1].endChar, chunks[i].startChar).trim()).toBe("");
    expect(chunks[i].endChar).toBeGreaterThan(chunks[i - 1].endChar);
  }
  return chunks;
}

describe("semanticChunk", () => {
  it("returns verbatim slices that start and end on word boundaries", () => {
    expectWellFormed(longParagraph);
    expectWellFormed(multiParagraph);
    expectWellFormed(wordsOnly);
  });

  it("opens an overlapping chunk on a sentence start when one is in reach", () => {
    const chunks = expectWellFormed(longParagraph);
    for (const c of chunks.slice(1)) expect(c.text.startsWith("Support tickets")).toBe(true);
    // The overlap repeats the tail of the previous chunk.
    expect(chunks[1].startChar).toBeLessThan(chunks[0].endChar);
  });

  it("keeps a short text as one chunk", () => {
    expect(semanticChunk("  One line.  ")).toEqual([{ text: "One line.", index: 0, startChar: 2, endChar: 11 }]);
  });
});

describe("splitSentences", () => {
  it("still respects abbreviations and initials", () => {
    expect(splitSentences("Dr. Smith met J. Doe. They agreed!  Next?")).toEqual(["Dr. Smith met J. Doe.", "They agreed!", "Next?"]);
  });
});

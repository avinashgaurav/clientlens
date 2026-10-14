import { describe, expect, it } from "vitest";
import { checkWritePayload, isTrustedSender } from "../utils/write-gate";
import type { SlideContent } from "../types";

const slides: SlideContent[] = [{ index: 0, title: "t", components: [{ type: "text_block", content: "Hello." }] }];

describe("checkWritePayload (service worker write gate)", () => {
  it("allows a verified or redacted draft", () => {
    expect(checkWritePayload({ slides, verification: "verified" })).toEqual({ ok: true, slides });
    expect(checkWritePayload({ slides, verification: "redacted" })).toEqual({ ok: true, slides });
  });

  it("rejects a draft held for review or not verified", () => {
    for (const verification of ["needs_review", "unverified"]) {
      const r = checkWritePayload({ slides, verification });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(`"${verification}"`);
    }
  });

  it("rejects a payload with no verification status", () => {
    const r = checkWritePayload({ slides });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("missing");
    expect(checkWritePayload(undefined).ok).toBe(false);
  });

  it("rejects a verified payload without slides", () => {
    expect(checkWritePayload({ verification: "verified" }).ok).toBe(false);
  });

  it("rejects malformed slides", () => {
    for (const bad of [[null], ["slide"], [{ index: 0, title: "t" }], [{ index: 0, title: "t", components: "x" }]]) {
      const r = checkWritePayload({ slides: bad, verification: "verified" });
      expect(r.ok).toBe(false);
    }
  });
});

describe("isTrustedSender", () => {
  it("accepts only this extension's own pages", () => {
    expect(isTrustedSender({ id: "self" }, "self")).toBe(true);
    // A content script (has a tab) or another extension is refused.
    expect(isTrustedSender({ id: "self", tab: { id: 3 } }, "self")).toBe(false);
    expect(isTrustedSender({ id: "other" }, "self")).toBe(false);
    expect(isTrustedSender({}, "self")).toBe(false);
  });
});

import type { SlideContent, VerificationResult } from "../types";

/** The WRITE_TO_DOC payload. `verification` is the council's fact-check status. */
export interface WriteToDocPayload {
  slides: SlideContent[];
  verification: VerificationResult["status"];
}

const WRITABLE: ReadonlySet<string> = new Set<VerificationResult["status"]>(["verified", "redacted"]);

/**
 * The service worker's write gate. Only a draft the validator cleared
 * ("verified") or cleaned ("redacted") may be written to a doc. Anything
 * else, including a payload with no status, is rejected, so a caller that
 * skips the sidebar's check still cannot write an unchecked draft.
 */
export function checkWritePayload(
  payload: unknown,
): { ok: true; slides: SlideContent[] } | { ok: false; error: string } {
  const p = (payload ?? {}) as Partial<Record<keyof WriteToDocPayload, unknown>>;
  if (typeof p.verification !== "string" || !WRITABLE.has(p.verification)) {
    const got = typeof p.verification === "string" ? `"${p.verification}"` : "missing";
    return {
      ok: false,
      error: `Write blocked: only a verified or redacted draft can be written to a doc (verification status: ${got}).`,
    };
  }
  if (!Array.isArray(p.slides)) return { ok: false, error: "Write blocked: no slides in the payload." };
  return { ok: true, slides: p.slides as SlideContent[] };
}

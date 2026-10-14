import type { SlideContent, VerificationResult } from "../types";

/** The WRITE_TO_DOC payload. `verification` is the council's fact-check status. */
export interface WriteToDocPayload {
  slides: SlideContent[];
  verification: VerificationResult["status"];
}

const WRITABLE: ReadonlySet<string> = new Set<VerificationResult["status"]>(["verified", "redacted"]);

/**
 * Only the extension's own pages (the sidebar) may ask for a write. A
 * content script's messages carry `sender.tab`, and another extension's
 * carry a different `sender.id`.
 */
export function isTrustedSender(sender: { id?: string; tab?: unknown }, runtimeId: string): boolean {
  return sender.id === runtimeId && !sender.tab;
}

/** Worker messages that only the extension's own pages may send. */
export const TRUSTED_ONLY_MESSAGES: ReadonlySet<string> = new Set(["WRITE_TO_DOC", "UNDO_WRITE", "FETCH_URL_TEXT"]);

/** Whether the worker should handle a message of `type` from `sender`. */
export function senderAllowed(type: string, sender: { id?: string; tab?: unknown }, runtimeId: string): boolean {
  return !TRUSTED_ONLY_MESSAGES.has(type) || isTrustedSender(sender, runtimeId);
}

/**
 * The service worker's write gate. Only a draft the validator cleared
 * ("verified") or cleaned ("redacted") may be written to a doc. Anything
 * else, including a payload with no status or malformed slides, is rejected.
 *
 * This guards against client mistakes (a sidebar code path that forgets its
 * own check), not against an attacker: the status is supplied by the caller,
 * so it is not a trust boundary. The sender check in the worker is what
 * keeps web pages and other extensions out.
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
  // google-writer inserts `title` as text and maps over `components`.
  const wellFormed = p.slides.every((s) => {
    const slide = s as { title?: unknown; components?: unknown } | null;
    return !!slide && typeof slide === "object" && typeof slide.title === "string" && Array.isArray(slide.components);
  });
  if (!wellFormed) return { ok: false, error: "Write blocked: a slide in the payload has no title or components list." };
  return { ok: true, slides: p.slides as SlideContent[] };
}

# Limitations and roadmap

What v1.0 does not do yet, where it is known to fall short, and what comes next.

## What this is not, yet

Worth knowing before you invest an evening in it:

- **No Chrome Web Store listing.** Load unpacked. Setup is a developer task.
- **Zoho is the only CRM**, and **Google Meet is the only meeting surface** that works end to end. HubSpot, Salesforce and Teams are on the roadmap.
- **Python 3.11+ is a hard requirement.** Dependencies resolve on 3.9, but the backend then fails at import, so it breaks later and more confusingly than you would expect.
- **Installing is still a developer step.** The extension loads unpacked in Developer mode (no Chrome Web Store listing yet). Once installed, the hosted backend and open sign-up let you try it with sample data without running a server.

### Known limitations

- **Validation is an LLM judgement, not a proof.** It catches what the validating model flags and nothing else. In the pitch council, a flagged claim is removed from the draft only when it can be located in its own slide's body text without ambiguity; otherwise the draft is held as "needs review" with the claims listed. A validator reply that cannot be read, or that itemises no claims, marks the draft "not verified" (or "needs review" if it states figures). Drafts in either state can be copied but not written to a doc from the sidebar. The only confidence figure shown is the share of itemised claims the validator traced to a source. During a live call, if the validator itself is unreachable, low-risk nudges (ask a question, cover an agenda item, a sentiment shift) are shown unvalidated and everything else is dropped.
- **The restatement check is a heuristic.** After removing a claim, the pitch council looks for a restatement elsewhere on the slide by shared figures, names and keywords; it errs toward holding the draft for review, can miss paraphrases with no shared figures or names (and non-Latin text), and the LLM validator remains the primary check.
- **Retrieval is brute-force.** The in-browser store scans every chunk with cosine similarity; fine for a personal knowledge base, slow for a large one.
- **Knowledge-base search runs only in the browser.** The backend stores uploaded files but does not index or search them.
- **Rate limiting is per user, not per tenant.** A daily token budget per user plus a process-wide OpenRouter throttle.

## Roadmap

### Switch on more of what's built

These features exist in the code and work once the hosted backend has the right keys.

| Feature | What it needs | Status |
|---|---|---|
| Write pitches into Google Slides and Docs, Google Calendar sync | A Google OAuth client ID for the extension's fixed ID (`VITE_GOOGLE_CLIENT_ID`) | Built. Without it, copy the draft instead; Calendar sync is unavailable. |
| Live coaching in Google Meet | A Deepgram API key and project ID on the backend, and the Copilot flag in the build (`VITE_MEETING_COPILOT=true`, `VITE_STT_PROVIDER=deepgram`) | Built, off in the shared build. Follow-ups in [#168](https://github.com/avinashgaurav/clientlens/issues/168). |

### Accounts and email

- **Password reset.** Needs a custom email provider (for example Resend) on the Supabase project; Supabase's built-in sender only reaches the project team. "Forgot password" stays hidden behind `VITE_PASSWORD_RESET` until then. [#165](https://github.com/avinashgaurav/clientlens/issues/165)
- **Sign-up protection:** turn on CAPTCHA and set a server-side minimum password length of 8 in Supabase > Authentication > Attack Protection (the extension already asks for 8). Sign-up is open, so this matters before wider sharing.

### Product

1. Salesforce and HubSpot connectors, Microsoft Teams copilot.
2. On-device STT (Whisper) for privacy-sensitive deployments.
3. Multi-tenant mode with org-level KB isolation.
4. Index Git repos as a knowledge source ([#175](https://github.com/avinashgaurav/clientlens/issues/175)); one-pager output laid out as a single summary ([#174](https://github.com/avinashgaurav/clientlens/issues/174)).

Done: a zero-setup way to try it. The hosted backend and open sign-up (v1.1.0) let anyone create an account and try it with sample data.

The backlog with acceptance criteria lives in [#113](https://github.com/avinashgaurav/clientlens/issues/113). Items are largely independent, so pick any of them in any order.

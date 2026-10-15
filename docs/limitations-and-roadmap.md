# Limitations and roadmap

What v1.0 does not do yet, where it is known to fall short, and what comes next.

## What this is not, yet

Worth knowing before you invest an evening in it:

- **No Chrome Web Store listing.** Load unpacked. Setup is a developer task.
- **Authentication is not wired.** See [Security model](security.md).
- **Zoho is the only CRM**, and **Google Meet is the only meeting surface** that works end to end. HubSpot, Salesforce and Teams are on the roadmap.
- **Python 3.11+ is a hard requirement.** Dependencies resolve on 3.9, but the backend then fails at import, so it breaks later and more confusingly than you would expect.
- **No way to try it without installing it.** Mock mode avoids spending LLM credits but still routes through the backend, so there is no offline or hosted demo.

### Known limitations

- **Validation is an LLM judgement, not a proof.** It catches what the validating model flags and nothing else. In the pitch council, a flagged claim is removed from the draft only when it can be located in its own slide's body text without ambiguity; otherwise the draft is held as "needs review" with the claims listed. A validator reply that cannot be read, or that itemises no claims, marks the draft "not verified" (or "needs review" if it states figures). Drafts in either state can be copied but not written to a doc from the sidebar. The only confidence figure shown is the share of itemised claims the validator traced to a source. During a live call, if the validator itself is unreachable, low-risk nudges (ask a question, cover an agenda item, a sentiment shift) are shown unvalidated and everything else is dropped.
- **The restatement check is a heuristic.** After removing a claim, the pitch council looks for a restatement elsewhere on the slide by shared figures, names and keywords; it errs toward holding the draft for review, can miss paraphrases with no shared figures or names (and non-Latin text), and the LLM validator remains the primary check.
- **Retrieval is brute-force.** The in-browser store scans every chunk with cosine similarity; fine for a personal knowledge base, slow for a large one.
- **Knowledge-base search runs only in the browser.** The backend stores uploaded files but does not index or search them.
- **Rate limiting is per user, not per tenant.** A daily token budget per user plus a process-wide OpenRouter throttle.

## Roadmap

1. **Wire real authentication.** Everything else is downstream of this: it is what gates a shared team deployment.
2. Salesforce and HubSpot connectors, Microsoft Teams copilot.
3. On-device STT (Whisper) for privacy-sensitive deployments.
4. Multi-tenant mode with org-level KB isolation.
5. A zero-setup way to try it. Mock mode still needs the backend running, so today there is no way to see the UI without a full install.

The backlog with acceptance criteria lives in [#113](https://github.com/avinashgaurav/project-wingman-ClientLens/issues/113). Items are largely independent, so pick any of them in any order.

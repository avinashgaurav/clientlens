# Security policy

## The one thing to know first

**Authentication is not wired in v1.0.** The sidebar provisions a local admin and
the backend runs with `DEV_MODE=true`, so any request that reaches the backend is
treated as an authenticated admin request.

**Keep the backend off the public internet.** Bind it to localhost, or put it
behind something that authenticates for it. That is fine for the single-user,
self-hosted case v1.0 targets. It is not safe for a shared team deployment, and
it is not safe to expose even briefly.

The full posture, including host permissions and what to lock down, is in
[docs/security.md](docs/security.md).

## Supported versions

| Version | Supported |
|---|---|
| v1.0.x | Yes |
| < v1.0 | No |

There is one maintainer, so expect best effort rather than an SLA.

## Reporting a vulnerability

**Do not open a public issue.** Use a
[private security advisory](https://github.com/avinashgaurav/project-wingman/security/advisories/new),
which lets us discuss the problem before there is a fix to point at.

Useful things to include: what you did, what happened, the version or commit, and
whether it needs an authenticated session (given the note above, assume it does
not).

I will acknowledge within a week. If a report is valid I will say what the fix is
and when it lands, and credit you in the release notes unless you would rather I
did not.

## What is in scope

Anything in this repository: the extension, the backend, the build and the
documented setup path.

Out of scope, because they are known and documented rather than undiscovered:

- The missing authentication layer described above.
- A backend that the operator chose to expose publicly.
- Provider keys held in an operator's own `.env`. Bring-your-own-keys means those
  live on your machine, and there is no Wingman server that could leak them.

## What this project does not do with your data

There is no hosted service and no telemetry endpoint. Call audio, transcripts,
knowledge base contents and provider keys stay on infrastructure you control. The
extension never holds a provider key; the backend proxies to your chosen LLM.

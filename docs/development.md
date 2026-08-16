# Development guide

Building, checking and releasing. See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to land a change.

## Development guide

### A note on the name `clientlens`

The project's original working name was **ClientLens**, and that string is still load-bearing in a few places, so you will see it while reading the source:

- `chrome.storage.local` key prefixes (call history, KB vector store, telemetry, admin gate)
- the feature flag `clientlens_objection_composer_v2`
- the default Pinecone index name (`PINECONE_INDEX` defaults to `clientlens`)
- transponder DOM element IDs

It is deliberately **not** renamed. Those storage keys and the index name are persistence identifiers: renaming them would orphan every existing user's call history, KB index, and admin passcode without a migration. If you fork this and want a clean namespace, do the rename and ship a one-time migration that copies the old keys forward before deleting them.

### Mock mode

Set `VITE_MOCK_MODE=true` to develop the UI without burning LLM credits. All agent calls return canned responses; the meeting copilot uses `mock-stt.ts` instead of streaming to Deepgram.

Note: in this codebase mock mode still routes through the FastAPI backend's `/api/v1/llm/complete` endpoint (the backend has its own mock branch). Pure offline UI dev with no backend running is not yet supported.

### Regenerating brand assets

Every visual identity asset comes from one script, so the toolbar icon, the site favicon, the nav and footer marks, the share card and the Product Hunt thumbnail cannot drift apart:

```bash
python3 scripts/make_brand_assets.py     # icons, icon.svg, favicon.svg, og.png, repo social card
```

Requires Pillow. Small icon sizes are not scaled from one master: the glow tightens and the chevron thickens as the canvas shrinks, because a 16px icon inheriting the 128px blur loses its silhouette. Edit `TUNING` in the script if you change the mark.

The popup and sidebar render `icons/icon128.png` directly rather than re-typing a text mark, which is how the product previously ended up showing three different identities at once.

### Type checking

```bash
cd extension && npm run type-check    # tsc --noEmit
```

### Linting

```bash
cd extension && npm run lint           # ESLint v9 over src/**/*.{ts,tsx}
bash scripts/lint-manifest.sh          # Manifest placeholder + permission lint
```

### Testing

Backend test scripts live in `backend/scripts/`:

```bash
bash backend/scripts/run_tests.sh           # All tests
python3 backend/scripts/test_openrouter.py  # OpenRouter integration sanity check
```

### The two build modes, and which one you want

This trips people up, so it is worth stating plainly before the commands.

| | `npm run dev` | `npm run build` |
|---|---|---|
| Vite mode | `development` | `production` |
| Backend it can reach | `http://localhost:8000` (and Ollama on `11434`) | a public **https** host only |
| `host_permissions` | localhost entries injected at build time | localhost never granted |
| Use it for | **self-hosting v1.0**, and any local development | a Chrome Web Store bundle |

**If you are self-hosting, you want `npm run dev`, and that is not a workaround.** v1.0 assumes one rep running the backend on their own machine, so a local backend is the supported shape. The Quick Start uses `npm run dev` for exactly this reason.

A release build deliberately **cannot** be produced against a local backend. `hostPermissionFor` in `extension/vite.config.ts` rejects any non-https URL, and outside development mode it also rejects loopback hosts, because granting a shipped extension access to the user's own machine is the vulnerability [issue #37](https://github.com/avinashgaurav/project-wingman-sales-copilot/issues/37) closed. Point `VITE_BACKEND_URL` at `http://localhost:8000` and run `npm run build`, and the build refuses with the reason and the suggested fix rather than emitting a broken manifest.

> [!WARNING]
> A release bundle needs a publicly reachable backend, and **until authentication is wired, a public backend is not safe to expose**: anyone who finds it can spend your LLM budget and read your knowledge base. Read [Security model](security.md) before you deploy one. Wiring auth is the top roadmap item precisely because it is what unlocks this path.

### Building for release

Only once you have a public https backend:

```bash
cd extension && npm run build               # vite build --mode production
bash scripts/lint-manifest.sh               # Fails if YOUR_*, your-backend.railway.app, or <all_urls> remain
```

The lint script blocks shipping placeholder strings or `<all_urls>` permissions to the Chrome Web Store.

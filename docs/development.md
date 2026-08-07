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
python3 scripts/make_brand_assets.py     # icons, icon.svg, favicon.svg, og.png, thumbnail, social card
python3 scripts/make_gallery_cards.py    # Product Hunt gallery cards
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

### Building for release

```bash
cd extension && npm run build               # vite build --mode production
bash scripts/lint-manifest.sh               # Fails if YOUR_*, your-backend.railway.app, or <all_urls> remain
```

The lint script blocks shipping placeholder strings or `<all_urls>` permissions to the Chrome Web Store.

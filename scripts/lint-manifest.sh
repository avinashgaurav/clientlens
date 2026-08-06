#!/usr/bin/env bash
# Lints the extension manifest for placeholder strings and over-broad
# permissions that must never ship. Run from repo root.
#
# Which file gets linted:
#   extension/dist/manifest.json  (the BUILT manifest) when it exists.
#   extension/manifest.json       (the template) as a fallback.
#
# extension/manifest.json is deliberately a template: vite.config.ts fills in
# oauth2.client_id from VITE_GOOGLE_CLIENT_ID and the backend host from
# VITE_BACKEND_URL at build time. So placeholders in the template are expected,
# and only the built output is release-relevant. `<all_urls>` is checked in both,
# because it must never appear anywhere.
#
# Exit codes: 0 clean, 1 placeholders/violations found, 2 no manifest at all.
set -euo pipefail

TEMPLATE="extension/manifest.json"
BUILT="extension/dist/manifest.json"

if [ ! -f "$TEMPLATE" ]; then
  echo "lint-manifest: $TEMPLATE not found (run from the repo root)" >&2
  exit 2
fi

FAIL=0

# `<all_urls>` is never legitimate, in either file.
for f in "$TEMPLATE" "$BUILT"; do
  [ -f "$f" ] || continue
  if grep -qE '"<all_urls>"' "$f"; then
    echo "lint-manifest: $f contains <all_urls>. Scope host_permissions and content_scripts." >&2
    FAIL=1
  fi
done

if [ ! -f "$BUILT" ]; then
  echo "lint-manifest: $BUILT not found, so only the template was checked."
  echo "lint-manifest: build first to validate what actually ships:"
  echo "                 cd extension && npm run build"
  if [ "$FAIL" -eq 0 ]; then
    echo "lint-manifest: template clean (placeholders in the template are expected)."
  fi
  exit "$FAIL"
fi

# WARNING, not an error. oauth2.client_id is only read by
# chrome.identity.getAuthToken, which only Google Slides/Docs/Drive export and
# Calendar sync use. Sign-in does not depend on it (the sidebar provisions a
# local admin user) and Zoho uses launchWebAuthFlow. A deployment with no
# Google export is legitimately fine without one.
if grep -q "YOUR_GOOGLE_CLIENT_ID" "$BUILT"; then
  echo "lint-manifest: NOTE, $BUILT has no oauth2.client_id set."
  echo "                Google Slides/Docs/Drive export and Calendar sync will not work."
  echo "                Everything else is unaffected. Set VITE_GOOGLE_CLIENT_ID to enable them."
fi

# ERROR. Without a host_permissions entry matching the backend, MV3 blocks every
# request the extension makes to it, so nothing in the product works.
if grep -q "your-backend.railway.app" "$BUILT"; then
  echo "lint-manifest: $BUILT contains your-backend.railway.app." >&2
  echo "                Set VITE_BACKEND_URL in extension/.env to your https" >&2
  echo "                backend URL, then rebuild. MV3 blocks all backend" >&2
  echo "                requests without a matching host permission." >&2
  FAIL=1
fi

# A production bundle granting page access to the developer's own machine is a
# real vulnerability, not a nit. Dev builds inject these on purpose.
if grep -qE '"http://localhost:[0-9]+/\*"' "$BUILT"; then
  echo "lint-manifest: $BUILT grants localhost host_permissions." >&2
  echo "                Expected in a dev build (npm run dev), never in a release." >&2
  echo "                For a release bundle use: npm run build" >&2
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "lint-manifest: clean ($BUILT)."
fi
exit "$FAIL"

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
# Checks are anchored to the JSON fields they describe (issue #123) rather than
# grepping the file as text, so a placeholder mentioned in an unrelated string,
# a comment-like key, or a URL query cannot trip a rule that is meant to be
# about oauth2.client_id or host_permissions. python3 is already required by
# scripts/make_brand_assets.py, so this adds no new dependency.
#
# Exit codes: 0 clean, 1 placeholders/violations found, 2 no manifest at all.
set -euo pipefail

TEMPLATE="extension/manifest.json"
BUILT="extension/dist/manifest.json"
MODE_FILE="extension/dist/.build-mode"

if [ ! -f "$TEMPLATE" ]; then
  echo "lint-manifest: $TEMPLATE not found (run from the repo root)" >&2
  exit 2
fi

# vite writes the build mode beside the manifest. A missing file is treated as a
# release so the localhost check fails closed: an older or hand-assembled dist is
# still held to release rules.
BUILD_MODE="unknown"
if [ -f "$MODE_FILE" ]; then
  BUILD_MODE="$(tr -d '[:space:]' < "$MODE_FILE")"
fi

python3 - "$TEMPLATE" "$BUILT" "$BUILD_MODE" <<'PY'
import json
import os
import re
import sys

template, built, build_mode = sys.argv[1], sys.argv[2], sys.argv[3]

CLIENT_ID_PLACEHOLDER = "YOUR_GOOGLE_CLIENT_ID"
BACKEND_PLACEHOLDER = "https://your-backend.railway.app/*"
LOOPBACK_MATCH = re.compile(r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/")

fail = 0


def err(*lines):
    for line in lines:
        print(line, file=sys.stderr)


def load(path):
    """Returns the parsed manifest, or None after reporting why it could not be."""
    global fail
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        err("lint-manifest: %s is not valid JSON (%s)." % (path, exc))
        fail = 1
        return None


def match_lists(manifest):
    """Every field that can legitimately hold a match pattern, with its path."""
    yield "host_permissions", manifest.get("host_permissions") or []
    yield "permissions", manifest.get("permissions") or []
    for i, script in enumerate(manifest.get("content_scripts") or []):
        yield "content_scripts[%d].matches" % i, script.get("matches") or []
    for i, res in enumerate(manifest.get("web_accessible_resources") or []):
        if isinstance(res, dict):
            yield "web_accessible_resources[%d].matches" % i, res.get("matches") or []


# `<all_urls>` is never legitimate, in either file, in any match-pattern field.
for path in (template, built):
    if not os.path.isfile(path):
        continue
    manifest = load(path)
    if manifest is None:
        continue
    for field, values in match_lists(manifest):
        if "<all_urls>" in values:
            err(
                "lint-manifest: %s has <all_urls> in %s." % (path, field),
                "                Scope host_permissions and content_scripts.",
            )
            fail = 1

if not os.path.isfile(built):
    print("lint-manifest: %s not found, so only the template was checked." % built)
    print("lint-manifest: build first to validate what actually ships:")
    print("                 cd extension && npm run dev      # self-hosted / local backend")
    print("                 cd extension && npm run build    # release, public https backend")
    if fail == 0:
        print("lint-manifest: template clean (placeholders in the template are expected).")
    sys.exit(fail)

manifest = load(built)
if manifest is None:
    sys.exit(1)

# WARNING, not an error. oauth2.client_id is only read by
# chrome.identity.getAuthToken, which only Google Slides/Docs/Drive export and
# Calendar sync use. Sign-in does not depend on it (the sidebar provisions a
# local admin user) and Zoho uses launchWebAuthFlow. A deployment with no
# Google export is legitimately fine without one.
client_id = (manifest.get("oauth2") or {}).get("client_id") or ""
if CLIENT_ID_PLACEHOLDER in client_id:
    print("lint-manifest: NOTE, %s has no oauth2.client_id set." % built)
    print("                Google Slides/Docs/Drive export and Calendar sync will not work.")
    print("                Everything else is unaffected. Set VITE_GOOGLE_CLIENT_ID to enable them.")

host_permissions = manifest.get("host_permissions") or []

# ERROR. Without a host_permissions entry matching the backend, MV3 blocks every
# request the extension makes to it, so nothing in the product works.
if BACKEND_PLACEHOLDER in host_permissions:
    err(
        "lint-manifest: %s still has %s in host_permissions." % (built, BACKEND_PLACEHOLDER),
        "                For a release, set VITE_BACKEND_URL to your public https",
        "                backend and rebuild. MV3 blocks all backend requests",
        "                without a matching host permission.",
        "                For a local backend use: npm run dev",
    )
    fail = 1

# A production bundle granting page access to the developer's own machine is a
# real vulnerability, not a nit. Dev builds inject these on purpose, which is why
# this is only an error outside a development build.
loopback = [h for h in host_permissions if LOOPBACK_MATCH.match(h)]
if loopback:
    listed = ", ".join(loopback)
    if build_mode == "development":
        print("lint-manifest: NOTE, %s grants loopback host_permissions (%s)." % (built, listed))
        print("                Correct for a dev build, which is how v1.0 is self-hosted.")
        print("                A release bundle (npm run build) never gets them.")
    else:
        err("lint-manifest: %s grants loopback host_permissions (%s)." % (built, listed))
        if build_mode == "unknown":
            err(
                "                No extension/dist/.build-mode, so this is treated as a",
                "                release. Rebuild with npm run dev or npm run build.",
            )
        else:
            err("                Never legitimate in a %s build." % build_mode)
        err("                For a local backend use: npm run dev")
        fail = 1

if fail == 0:
    print("lint-manifest: clean (%s)." % built)
sys.exit(fail)
PY

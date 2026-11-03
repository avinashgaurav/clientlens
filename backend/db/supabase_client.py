from supabase import create_client, Client
from config import settings
from typing import Optional
import time

import jwt
import structlog

log = structlog.get_logger()

_client: Optional[Client] = None


class SupabaseNotConfigured(RuntimeError):
    """Raised when .env is missing the two values Supabase cannot start without."""


def missing_config() -> list:
    return [
        name
        for name, value in (
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_SERVICE_KEY", settings.supabase_service_key),
        )
        if not value or not value.strip()
    ]


def supabase_client() -> Client:
    global _client
    if _client is None:
        # Without this check the supabase library raises "supabase_key is
        # required" from four frames down, which tells a first-time user nothing
        # about which file to edit.
        missing = missing_config()
        if missing:
            raise SupabaseNotConfigured(
                "backend/.env is missing: %s" % ", ".join(missing)
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


async def init_supabase():
    supabase_client()
    log.info("supabase.ready")


# Profiles change rarely (a role edit), so each is cached briefly instead of
# costing a database round trip on every request.
_PROFILE_TTL_S = 60
_profile_cache: dict[str, tuple[float, dict]] = {}
_jwks_client = None


def _claims(token: str) -> Optional[dict]:
    """Verify a Supabase access token locally and return its claims, or None.

    HS256 tokens are checked with the project's JWT secret. Projects that moved
    to asymmetric signing keys (ES256/RS256) are checked against the project's
    published JWKS. Audience must be `authenticated`, so anon and service keys
    (which are also JWTs) are refused.
    """
    global _jwks_client
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        issuer = settings.supabase_url.rstrip("/") + "/auth/v1"
        if alg == "HS256":
            key = settings.jwt_secret
        elif alg in ("ES256", "RS256"):
            if _jwks_client is None:
                _jwks_client = jwt.PyJWKClient(issuer + "/.well-known/jwks.json", cache_keys=True, lifespan=600)
            key = _jwks_client.get_signing_key_from_jwt(token).key
        else:
            return None
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated", issuer=issuer, leeway=30)
    except jwt.PyJWTError as e:
        log.info("auth.token_rejected", reason=type(e).__name__)
        return None


async def verify_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return the caller's profile (id, email, name, role)."""
    claims = _claims(token)
    if not claims or not claims.get("sub"):
        return None
    user_id = claims["sub"]
    hit = _profile_cache.get(user_id)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL_S:
        return hit[1]
    try:
        profile = (
            supabase_client()
            .table("user_profiles")
            .select("id, email, name, role")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        log.warning("auth.profile_lookup_failed", error=str(e))
        return None
    if not profile or not profile.data:
        return None
    _profile_cache[user_id] = (time.monotonic(), profile.data)
    return profile.data

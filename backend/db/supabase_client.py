from supabase import create_client, Client
from config import settings
from typing import Optional
import asyncio
import time

import httpx
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
# costing a database round trip on every request. Bounded so it can't grow
# with every account that ever signs in.
_PROFILE_TTL_S = 60
_PROFILE_CACHE_MAX = 2000
_profile_cache: dict[str, tuple[float, dict]] = {}

# The project's public signing keys, fetched at most once a minute. A token
# naming an unknown key id inside that window is refused without a fetch, so
# anonymous callers can't make every request trigger an outbound call.
_JWKS_MIN_REFETCH_S = 60
_jwks: dict[str, object] = {}
_jwks_fetched_at: Optional[float] = None  # None: never fetched


class AuthUnavailable(RuntimeError):
    """The token may be fine but the user's profile couldn't be read (503, not 401)."""


def _issuer() -> str:
    return settings.supabase_url.rstrip("/") + "/auth/v1"


def _jwks_key(kid: str):
    global _jwks, _jwks_fetched_at
    # The first fetch always happens: the monotonic clock counts from boot, so a
    # fresh serverless instance may be younger than the refetch window.
    if kid not in _jwks and (_jwks_fetched_at is None or time.monotonic() - _jwks_fetched_at > _JWKS_MIN_REFETCH_S):
        _jwks_fetched_at = time.monotonic()
        try:
            res = httpx.get(_issuer() + "/.well-known/jwks.json", timeout=3.0)
            res.raise_for_status()
            _jwks = {k.key_id: k.key for k in jwt.PyJWKSet.from_dict(res.json()).keys if k.key_id}
        except Exception as e:  # noqa: BLE001
            log.warning("auth.jwks_fetch_failed", error=str(e))
    return _jwks.get(kid)


def _claims(token: str) -> Optional[dict]:
    """Verify a Supabase access token locally and return its claims, or None.

    Asymmetric tokens (ES256/RS256) are checked against the project's JWKS.
    HS256 is accepted only when listed in JWT_ALGORITHMS, with the project's
    JWT secret. Audience must be `authenticated` (anon and service keys are
    refused), the standard claims must be present, and anonymous sign-ins are
    refused.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if alg not in settings.allowed_jwt_algorithms:
            return None
        if alg == "HS256":
            key = settings.jwt_secret
        else:
            key = _jwks_key(header.get("kid") or "")
            if key is None:
                return None
        claims = jwt.decode(
            token, key, algorithms=[alg], audience="authenticated", issuer=_issuer(), leeway=30,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as e:
        log.info("auth.token_rejected", reason=type(e).__name__)
        return None
    if claims.get("is_anonymous"):
        return None
    return claims


def _load_profile(user_id: str) -> Optional[dict]:
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
        raise AuthUnavailable(str(e)) from e
    return profile.data if profile and profile.data else None


async def verify_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return the caller's profile (id, email, name, role).

    None means the token or account isn't valid (401). AuthUnavailable means
    the profile couldn't be read right now (503). The blocking work (a rare
    JWKS fetch, the profile query) runs off the event loop.
    """
    claims = await asyncio.to_thread(_claims, token)
    if not claims or not claims.get("sub"):
        return None
    user_id = claims["sub"]
    hit = _profile_cache.get(user_id)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL_S:
        return hit[1]
    profile = await asyncio.to_thread(_load_profile, user_id)
    if profile is None:
        _profile_cache.pop(user_id, None)
        return None
    if len(_profile_cache) >= _PROFILE_CACHE_MAX:
        _profile_cache.pop(next(iter(_profile_cache)))
    _profile_cache[user_id] = (time.monotonic(), profile)
    return profile

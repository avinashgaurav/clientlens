from supabase import create_client, Client
from config import settings
from typing import Optional
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


async def verify_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return user profile."""
    try:
        result = supabase_client().auth.get_user(token)
        if not result.user:
            return None

        profile = (
            supabase_client()
            .table("user_profiles")
            .select("id, email, name, role")
            .eq("id", result.user.id)
            .single()
            .execute()
        )
        return profile.data
    except Exception:
        return None


async def get_design_system() -> Optional[dict]:
    try:
        result = (
            supabase_client()
            .table("design_systems")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


async def get_brand_voice() -> Optional[dict]:
    try:
        result = (
            supabase_client()
            .table("brand_voice")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None

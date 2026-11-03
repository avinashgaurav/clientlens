import os

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # LLM provider keys: optional per deployment. The proxy returns 503 if a
    # request comes in for a provider whose key isn't configured.
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""

    # OpenRouter app attribution headers: recommended but optional.
    # https://openrouter.ai/docs/api-reference/overview#app-attribution
    openrouter_referer: str = "https://clientlens.example.com"
    openrouter_title: str = "ClientLens"

    # Supabase. The Vercel Supabase integration injects SUPABASE_SERVICE_ROLE_KEY
    # and SUPABASE_JWT_SECRET, so both spellings are accepted.
    supabase_url: str
    supabase_service_key: str = Field(validation_alias=AliasChoices("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"))

    # Deepgram: kept server-side so the API key is never baked into the
    # extension bundle. The /api/v1/stt/token endpoint mints short-lived
    # (60 s) temporary keys for the extension to use directly with Deepgram.
    deepgram_api_key: str = ""
    deepgram_project_id: str = ""  # required to mint temp keys; get from Deepgram console

    # Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # Zoho CRM OAuth: kept server-side so the client_secret is never exposed
    # in the extension bundle. The extension proxies refresh-token exchanges
    # through /api/v1/zoho/refresh. Closes #33.
    zoho_client_id: str = ""
    zoho_client_secret: str = ""

    # App
    backend_url: str = "http://localhost:8000"
    # Production CORS allowlist. `chrome-extension://<ID>` entries MUST include
    # the real 32-char extension ID: `chrome-extension://` alone never matches
    # a real Origin header. Operators set this via the `ALLOWED_ORIGINS` env
    # var per deployment. In `dev_mode`, main.py adds an `allow_origin_regex`
    # that accepts any unpacked-extension build + any localhost port, so this
    # default only matters for production-style boots. Closes #13.
    allowed_origins: List[str] = ["http://localhost:3000"]
    # Which token algorithms are accepted. Supabase projects on signing keys
    # issue ES256 (or RS256); add HS256 only for a project still on the legacy
    # shared secret, and then set JWT_SECRET to that project's secret.
    jwt_algorithms: str = "ES256,RS256"
    # The Supabase project's legacy JWT secret, used only when HS256 is enabled.
    jwt_secret: str = Field(default="change-me-in-production", validation_alias=AliasChoices("SUPABASE_JWT_SECRET", "JWT_SECRET"))

    # Local dev: skip JWT verification, inject stub user in AuthMiddleware.
    # Never enable in production.
    dev_mode: bool = False

    @property
    def allowed_jwt_algorithms(self) -> frozenset[str]:
        return frozenset(a.strip() for a in self.jwt_algorithms.split(",") if a.strip()) & {"HS256", "ES256", "RS256"}

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# HS256 tokens are only as strong as the secret they're signed with, so a
# deployment that accepts them must have the project's real secret, not a
# placeholder or a short value typed to get past this check.
if "HS256" in settings.allowed_jwt_algorithms and not settings.dev_mode and (
    settings.jwt_secret == "change-me-in-production" or len(settings.jwt_secret) < 32
):
    raise RuntimeError(
        "JWT_ALGORITHMS includes HS256, but JWT_SECRET is the placeholder or shorter than 32 "
        "characters. Set it to your Supabase project's JWT secret, or remove HS256."
    )

# DEV_MODE accepts every request as a stub user. Refuse it on Vercel, where the
# backend is reachable from the internet.
if settings.dev_mode and os.environ.get("VERCEL"):
    raise RuntimeError("DEV_MODE must not be enabled on a Vercel deployment.")

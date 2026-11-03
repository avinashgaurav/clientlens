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
    # The Supabase project's JWT secret: verifies HS256 access tokens locally.
    # Projects on asymmetric signing keys are verified against the JWKS instead.
    jwt_secret: str = Field(default="change-me-in-production", validation_alias=AliasChoices("SUPABASE_JWT_SECRET", "JWT_SECRET"))

    # Local dev: skip JWT verification, inject stub user in AuthMiddleware.
    # Never enable in production.
    dev_mode: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Fail-fast if someone ships the placeholder jwt_secret to a non-dev deployment.
# pydantic-settings silently accepts it, so we guard here instead.
if settings.jwt_secret == "change-me-in-production" and not settings.dev_mode:
    raise RuntimeError(
        "JWT_SECRET is still set to the placeholder value 'change-me-in-production'. "
        "Set a real secret in your .env before starting the server. "
        "If you are running local dev without JWT auth, set DEV_MODE=true."
    )

from fastapi import APIRouter, Request, HTTPException
import json
from typing import Annotated

from pydantic import BaseModel, Field, model_validator
from db.supabase_client import supabase_client
from rbac.roles import require_permission, Role

router = APIRouter()


class BrandVoiceUpdate(BaseModel):
    tone_adjectives: list[Annotated[str, Field(max_length=60)]] = Field(max_length=50)
    avoid_words: list[Annotated[str, Field(max_length=60)]] = Field(max_length=200)
    messaging_framework: dict
    icp_tone_overrides: dict = {}

    @model_validator(mode="after")
    def _bounded(self) -> "BrandVoiceUpdate":
        # The two free-form objects are stored as JSON; keep each under 20 KB.
        for name in ("messaging_framework", "icp_tone_overrides"):
            if len(json.dumps(getattr(self, name))) > 20_000:
                raise ValueError(f"{name} is too large (20 KB max).")
        return self


class UserRoleUpdate(BaseModel):
    user_id: str
    role: Role


@router.get("/brand-voice")
async def get_brand_voice(request: Request):
    user = request.state.user
    require_permission(user["role"], "brand_voice:read")
    # Each workspace has its own brand voice: the latest one this user saved.
    result = supabase_client().table("brand_voice").select("*").eq("updated_by", user["id"]).order("created_at", desc=True).limit(1).execute()
    return result.data[0] if result.data else {}


@router.put("/brand-voice")
async def update_brand_voice(request: Request, body: BrandVoiceUpdate):
    user = request.state.user
    require_permission(user["role"], "brand_voice:write")

    # One brand voice per user: saving replaces it (migration 007).
    result = supabase_client().table("brand_voice").upsert({
        "tone_adjectives": body.tone_adjectives,
        "avoid_words": body.avoid_words,
        "messaging_framework": body.messaging_framework,
        "icp_tone_overrides": body.icp_tone_overrides,
        "updated_by": user["id"],
    }, on_conflict="updated_by").execute()

    return result.data[0]


@router.get("/users")
async def list_users(request: Request):
    user = request.state.user
    require_permission(user["role"], "users:read")
    result = supabase_client().table("user_profiles").select("id, email, name, role, created_at").execute()
    return {"users": result.data}


@router.patch("/users/role")
async def update_user_role(request: Request, body: UserRoleUpdate):
    user = request.state.user
    require_permission(user["role"], "users:assign_role")

    result = (
        supabase_client()
        .table("user_profiles")
        .update({"role": body.role})
        .eq("id", body.user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "User not found")

    return result.data[0]

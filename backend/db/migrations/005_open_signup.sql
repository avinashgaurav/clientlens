-- Migration 005: open sign-up
-- Run in Supabase SQL editor after 004_owner_role.sql
--
-- With open sign-up, every account is its own workspace:
--   - new users get the `owner` role: full control of their own data, no
--     access to anyone else's and no user management (that stays `admin`);
--   - assets, brand voice and design systems are readable only by the user
--     who created them;
--   - per-user daily usage is summed in the database (LLM tokens and live
--     transcription sessions), so the backend's caps don't fetch every row.

begin;

alter table user_profiles alter column role set default 'owner';

-- ── Own-rows-only reads (replace 003's role-gated, org-wide reads) ───────────
drop policy if exists "role_gated_read_design_system" on design_systems;
drop policy if exists "role_gated_read_brand_voice"   on brand_voice;
drop policy if exists "role_gated_read_assets"        on assets;

create policy "own_read_design_system" on design_systems
  for select using (auth.uid() = uploaded_by);

create policy "own_read_brand_voice" on brand_voice
  for select using (auth.uid() = updated_by);

create policy "own_read_assets" on assets
  for select using (auth.uid() = uploaded_by);

create index if not exists assets_owner_idx on assets (uploaded_by, created_at desc);
create index if not exists brand_voice_owner_idx on brand_voice (updated_by, created_at desc);

-- ── Usage sums for the daily caps ────────────────────────────────────────────
-- Called by the backend with the service key. The day is the UTC day.
create or replace function public.user_tokens_today(uid uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(input_tokens + output_tokens), 0)::bigint
  from llm_usage
  where user_id = uid
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- One row per Deepgram temp key issued (one live transcription session).
create table if not exists stt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists stt_sessions_user_idx on stt_sessions (user_id, created_at desc);
alter table stt_sessions enable row level security;
create policy "users_read_own_stt_sessions" on stt_sessions
  for select using (auth.uid() = user_id);

create or replace function public.user_stt_sessions_today(uid uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from stt_sessions
  where user_id = uid
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- Only the backend (service role) may call the usage functions.
revoke execute on function public.user_tokens_today(uuid) from public, anon, authenticated;
revoke execute on function public.user_stt_sessions_today(uuid) from public, anon, authenticated;

-- ── Storage ──────────────────────────────────────────────────────────────────
-- 001 asked for these to be made by hand; create them here if missing.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false), ('exports', 'exports', false)
on conflict (id) do nothing;

commit;

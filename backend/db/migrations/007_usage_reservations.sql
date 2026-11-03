-- Migration 007: reserve usage before spending it
-- Run in Supabase SQL editor after 006_fix_signup_trigger.sql
--
-- 005's caps read today's usage, then let the call run, then logged it. That
-- had two holes on a public, open-sign-up deployment:
--   - concurrent requests all read the same total before any of them logged;
--   - a call that ended early (client abort, provider error) logged 0 tokens
--     although the provider had already billed the input.
-- Now a call first reserves its estimated tokens: under one lock, the user's
-- and the deployment's totals are checked and a usage row holding the
-- estimate is inserted. The backend later replaces the estimate with the
-- provider's real counts only when the call completed. Live transcription
-- sessions are reserved the same way.

-- One lock for every reservation keeps the global ceiling exact; at this
-- scale a reservation is a couple of index lookups, so contention is fine.
create or replace function public.reserve_llm_tokens(
  uid uuid, est bigint, user_cap bigint, global_cap bigint, p_provider text, p_model text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  user_used bigint;
  global_used bigint;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('clientlens.llm_usage'));
  select coalesce(sum(input_tokens + output_tokens), 0) into user_used
    from public.llm_usage where user_id = uid and created_at >= day_start;
  if user_used + est > user_cap then
    return jsonb_build_object('reason', 'user', 'used', user_used);
  end if;
  select coalesce(sum(input_tokens + output_tokens), 0) into global_used
    from public.llm_usage where created_at >= day_start;
  if global_used + est > global_cap then
    return jsonb_build_object('reason', 'global', 'used', global_used);
  end if;
  insert into public.llm_usage (user_id, provider, model, input_tokens, output_tokens, error)
    values (uid, p_provider, p_model, least(est, 2147483647)::int, 0, 'in_progress')
    returning id into new_id;
  return jsonb_build_object('id', new_id, 'used', user_used);
end;
$$;

create or replace function public.reserve_stt_session(uid uuid, user_cap bigint)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('clientlens.stt_sessions'));
  if (select count(*) from public.stt_sessions
      where user_id = uid
        and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') >= user_cap then
    return null;
  end if;
  insert into public.stt_sessions (user_id) values (uid) returning id into new_id;
  return new_id;
end;
$$;

-- 005's read-only helpers: pin their search path too.
create or replace function public.user_tokens_today(uid uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(input_tokens + output_tokens), 0)::bigint
  from public.llm_usage
  where user_id = uid
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

create or replace function public.user_stt_sessions_today(uid uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(*)::bigint
  from public.stt_sessions
  where user_id = uid
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- Only the backend (service role) may reserve, and nobody calls the trigger.
revoke execute on function public.reserve_llm_tokens(uuid, bigint, bigint, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_stt_session(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 003's org-wide helper is unused since 005.
drop function if exists public.auth_user_has_brand_read();

-- ── Per-user storage quota ───────────────────────────────────────────────────
alter table assets add column if not exists bytes bigint not null default 0;

-- ── Storage buckets: force private, cap object size ──────────────────────────
-- 005 only created them if missing; one made by hand earlier could be public.
-- No policies exist on storage.objects for these buckets, so only the
-- backend's service key can read or write them.
update storage.buckets
  set public = false, file_size_limit = 4194304
  where id in ('assets', 'exports');

-- ── Brand voice: one row per user ────────────────────────────────────────────
-- Saving replaces the user's previous brand voice instead of adding a row each
-- time (a scripted account could otherwise grow the table without limit).
delete from brand_voice b
  using brand_voice newer
  where b.updated_by = newer.updated_by and b.created_at < newer.created_at;
create unique index if not exists brand_voice_one_per_user on brand_voice (updated_by);

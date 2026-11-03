-- Migration 006: make the sign-up trigger work
-- Run in Supabase SQL editor after 005_open_signup.sql
--
-- Supabase Auth inserts into auth.users as `supabase_auth_admin`, whose
-- search_path is `auth`. 001's handle_new_user() named `user_profiles` without
-- a schema, so it resolved to auth.user_profiles, which doesn't exist, and every
-- sign-up failed with "Database error creating new user". Pin the search path
-- and qualify the table.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

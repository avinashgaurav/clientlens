-- Migration 004: add the `owner` role
-- Run in Supabase SQL editor after 003_tighten_rls.sql, on its own: a new enum
-- value must be committed before 005 can use it.

alter type user_role add value if not exists 'owner';

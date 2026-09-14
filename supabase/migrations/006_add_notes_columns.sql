-- Free-text notes on templates and exercises: form cues, setup, progression
-- rules. Nullable and written as null when empty, so every existing row stays
-- valid and the client treats null and "" the same way (see src/lib/sync.ts).
--
-- Run this in the Supabase SQL Editor first, before 007 (per-user ids) and
-- 008, which seeds rows that include these columns.

alter table public.templates
  add column if not exists notes text;

alter table public.exercise_library
  add column if not exists notes text;

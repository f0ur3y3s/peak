-- Make template and exercise ids unique PER USER rather than globally.
--
-- Both tables were created with `id` alone as the primary key, so any fixed
-- id could only ever exist for one account. That was survivable while ids
-- were random UUIDs, but the seeded training program uses deterministic ids
-- ("ppl-v1-push-a", …) so that re-seeding converges instead of duplicating —
-- which means the second account to seed or sync them would collide on the
-- primary key, fail the RLS check on a row it does not own, and get a sync
-- error rather than a program.
--
-- (user_id, id) fixes that: every account can hold its own copy of the same
-- id. Nothing else needs changing — PostgREST infers the upsert's conflict
-- target from the primary key, so src/lib/sync.ts keeps working as written,
-- and the tombstone and pull queries already filter on user_id.
--
-- Run this BEFORE 008, which seeds rows using "on conflict (user_id, id)".
-- Safe to re-run: it does nothing if the composite key is already in place.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'templates_pkey'
      and conrelid = 'public.templates'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.templates drop constraint templates_pkey;
    alter table public.templates add primary key (user_id, id);
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'exercise_library_pkey'
      and conrelid = 'public.exercise_library'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.exercise_library drop constraint exercise_library_pkey;
    alter table public.exercise_library add primary key (user_id, id);
  end if;
end $$;

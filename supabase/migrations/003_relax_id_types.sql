-- The local IndexedDB store never actually enforced UUID-formatted ids —
-- the original seed exercise library used plain strings ("e1", "e2", "e3"),
-- which fail to insert against a `uuid` column. Relax to `text` everywhere
-- an id (or a reference to one) is stored, since Postgres text comparison
-- works fine and this avoids an entire class of sync failures for any
-- legacy or future non-UUID local id.

alter table public.templates
  alter column id type text;

alter table public.exercise_library
  alter column id type text;

alter table public.workout_sessions
  alter column id type text,
  alter column template_id type text;

alter table public.active_workout_draft
  alter column template_id type text;

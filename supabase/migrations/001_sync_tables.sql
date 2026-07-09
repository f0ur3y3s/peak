-- Cross-device sync tables. Run this in the Supabase SQL Editor.
-- Mirrors the local IndexedDB stores in src/lib/db.ts, one table each,
-- scoped per-user via Row Level Security.

create table public.templates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exercises jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exercise_library (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid,
  template_name text not null,
  started_at bigint not null,
  finished_at bigint not null,
  exercises jsonb not null,
  prs jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.active_workout_draft (
  user_id uuid primary key references auth.users(id) on delete cascade,
  template_id uuid not null,
  template_name text not null,
  started_at bigint not null,
  exercises jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.templates enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.active_workout_draft enable row level security;

create policy "Users manage their own templates"
  on public.templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own exercise library"
  on public.exercise_library for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own workout sessions"
  on public.workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own active workout draft"
  on public.active_workout_draft for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index templates_user_updated_idx on public.templates (user_id, updated_at);
create index exercise_library_user_updated_idx on public.exercise_library (user_id, updated_at);
create index workout_sessions_user_updated_idx on public.workout_sessions (user_id, updated_at);

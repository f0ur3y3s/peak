-- Let a finished workout be deleted on one device and stay deleted on the
-- others.
--
-- templates, exercise_library and active_workout_draft were all created with
-- a deleted_at column in 001; workout_sessions was not, because at the time
-- nothing could delete one. The app now can — a double-tapped Log, a set
-- typed as 120 instead of 20 — and without this column the deletion is local
-- to whichever device you did it on, and the next sync pulls the session
-- straight back down.
--
-- The client is written to survive this migration NOT having been run: a
-- session delete still applies locally, and its tombstone simply stays
-- pending (sync carries on doing everything else) until this lands, at which
-- point it propagates on the next pass. Nothing needs to be re-deleted by
-- hand.
--
-- Safe to re-run.

alter table public.workout_sessions
  add column if not exists deleted_at timestamptz;

-- Mirrors the partial index pattern the other soft-deleted tables use: pulls
-- filter on (user_id, updated_at) and read deleted_at alongside it.
create index if not exists workout_sessions_user_deleted_idx
  on public.workout_sessions (user_id, deleted_at);

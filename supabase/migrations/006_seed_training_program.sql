-- Seeds the 5-day Push/Pull/Legs training program from the body
-- recomposition plan into a user's synced rows. Training only — the plan's
-- nutrition, cardio and check-in sections have no table to live in.
--
-- Run this in the Supabase SQL Editor, after replacing the email on the
-- SELECT below with the account to seed. Optional: the app seeds the same
-- program client-side on first load (ensureProgramSeed() in src/lib/db.ts)
-- and pushes it up on the next sync, so this file only matters if you want
-- the rows present server-side before any device opens the app.
--
-- Ids match src/lib/seedProgram.ts exactly, so running both paths converges
-- on the same rows instead of creating duplicates. Re-running is a no-op
-- ("on conflict do nothing"): it will not overwrite loads, rep ranges or
-- reordering you have since changed in the app.
--
-- Rows are stamped now() rather than a fixed date on purpose: the client
-- pulls only rows newer than its last-synced watermark, so a backdated stamp
-- would never reach a device that has already synced.
--
-- Note: templates.id and exercise_library.id are global primary keys, so
-- these fixed ids can only be seeded for ONE account. Seeding a second
-- account needs a different id prefix.

do $$
declare
  target_user uuid;
  seeded_at constant timestamptz := now();
begin
  select id into target_user from auth.users where email = 'you@example.com';
  if target_user is null then
    raise exception 'No auth.users row for that email — check the address above.';
  end if;

  insert into public.exercise_library (id, user_id, name, muscle, updated_at)
  select v.id, target_user, v.name, v.muscle, seeded_at
  from (values
    ('ppl-v1-ex-barbell-bench-press', 'Barbell Bench Press', 'Chest'),
    ('ppl-v1-ex-incline-db-press', 'Incline Dumbbell Press', 'Upper Chest'),
    ('ppl-v1-ex-cable-lateral-raise', 'Cable Lateral Raise', 'Side Delts'),
    ('ppl-v1-ex-machine-chest-fly', 'Machine Chest Fly', 'Chest'),
    ('ppl-v1-ex-overhead-tricep-ext', 'Overhead Tricep Extension (Rope)', 'Triceps'),
    ('ppl-v1-ex-tricep-pushdown', 'Tricep Pushdown (Straight Bar)', 'Triceps'),
    ('ppl-v1-ex-weighted-pull-up', 'Weighted Pull-Up', 'Lats'),
    ('ppl-v1-ex-barbell-row', 'Barbell Row (Overhand)', 'Lats'),
    ('ppl-v1-ex-seated-cable-row', 'Seated Cable Row (V-Bar)', 'Rhomboids'),
    ('ppl-v1-ex-rear-delt-fly', 'Rear Delt Fly', 'Rear Delts'),
    ('ppl-v1-ex-incline-db-curl', 'Incline Dumbbell Curl', 'Biceps'),
    ('ppl-v1-ex-hammer-curl', 'Hammer Curl', 'Biceps'),
    ('ppl-v1-ex-leg-press', 'Leg Press', 'Quads'),
    ('ppl-v1-ex-romanian-deadlift', 'Romanian Deadlift', 'Hamstrings'),
    ('ppl-v1-ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'Glutes'),
    ('ppl-v1-ex-leg-extension', 'Leg Extension', 'Quads'),
    ('ppl-v1-ex-leg-curl', 'Leg Curl', 'Hamstrings'),
    ('ppl-v1-ex-standing-calf-raise', 'Standing Calf Raise', 'Calves'),
    ('ppl-v1-ex-cable-crunch', 'Cable Crunch', 'Abs'),
    ('ppl-v1-ex-seated-db-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Front Delts'),
    ('ppl-v1-ex-db-lateral-raise', 'Dumbbell Lateral Raise', 'Side Delts'),
    ('ppl-v1-ex-cable-chest-press', 'Cable Chest Press (Low to High)', 'Upper Chest'),
    ('ppl-v1-ex-machine-shoulder-press', 'Machine Shoulder Press', 'Front Delts'),
    ('ppl-v1-ex-skull-crusher', 'Skull Crusher (EZ-Bar)', 'Triceps'),
    ('ppl-v1-ex-dips', 'Dips', 'Lower Chest'),
    ('ppl-v1-ex-single-arm-db-row', 'Single-Arm Dumbbell Row', 'Lats'),
    ('ppl-v1-ex-lat-pulldown', 'Lat Pulldown (Wide Grip)', 'Lats'),
    ('ppl-v1-ex-face-pull', 'Face Pull', 'Rear Delts'),
    ('ppl-v1-ex-preacher-curl', 'Preacher Curl', 'Biceps'),
    ('ppl-v1-ex-cable-curl', 'Cable Curl (Single-Arm, High Pulley)', 'Biceps'),
    ('ppl-v1-ex-reverse-barbell-curl', 'Reverse Barbell Curl', 'Forearms')
  ) as v(id, name, muscle)
  on conflict (id) do nothing;

  insert into public.templates (id, user_id, name, exercises, position, updated_at)
  select v.id, target_user, v.name, v.exercises, v.position, seeded_at
  from (values
    ('ppl-v1-push-a', 'Push A', '[{"exerciseId":"ppl-v1-ex-barbell-bench-press","order":0,"targetSets":4,"repsMin":5,"repsMax":6,"targetWeight":0,"restSeconds":210},{"exerciseId":"ppl-v1-ex-incline-db-press","order":1,"targetSets":3,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-cable-lateral-raise","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-machine-chest-fly","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-overhead-tricep-ext","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-tricep-pushdown","order":5,"targetSets":3,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":60}]'::jsonb, 0),
    ('ppl-v1-pull-a', 'Pull A', '[{"exerciseId":"ppl-v1-ex-weighted-pull-up","order":0,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-barbell-row","order":1,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-seated-cable-row","order":2,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-rear-delt-fly","order":3,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-incline-db-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-hammer-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75}]'::jsonb, 1),
    ('ppl-v1-legs', 'Legs', '[{"exerciseId":"ppl-v1-ex-leg-press","order":0,"targetSets":4,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":165},{"exerciseId":"ppl-v1-ex-romanian-deadlift","order":1,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-bulgarian-split-squat","order":2,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-leg-extension","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-leg-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-standing-calf-raise","order":5,"targetSets":4,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":60},{"exerciseId":"ppl-v1-ex-cable-crunch","order":6,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 2),
    ('ppl-v1-push-b', 'Push B', '[{"exerciseId":"ppl-v1-ex-seated-db-shoulder-press","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-db-lateral-raise","order":1,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-chest-press","order":2,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-machine-shoulder-press","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-skull-crusher","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-dips","order":5,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120}]'::jsonb, 3),
    ('ppl-v1-pull-b', 'Pull B', '[{"exerciseId":"ppl-v1-ex-single-arm-db-row","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-lat-pulldown","order":1,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-face-pull","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-preacher-curl","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-curl","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-reverse-barbell-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 4)
  ) as v(id, name, exercises, position)
  on conflict (id) do nothing;
end $$;

-- Seeds the 5-day Push/Pull/Legs training program from the body
-- recomposition plan into a user's synced rows. Training only — the plan's
-- nutrition, cardio and check-in sections have no table to live in.
--
-- Requires 006_add_notes_columns.sql — run that first.
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

  insert into public.exercise_library (id, user_id, name, muscle, notes, updated_at)
  select v.id, target_user, v.name, v.muscle, v.notes, seeded_at
  from (values
    ('ppl-v1-ex-barbell-bench-press', 'Barbell Bench Press', 'Chest', 'Add 2.5kg/side when all 4 sets hit 6 reps. Primary strength movement — log every session.'),
    ('ppl-v1-ex-incline-db-press', 'Incline Dumbbell Press', 'Upper Chest', 'Add 2kg DBs at top of range. Upper chest emphasis. RPE 8, 1–2 reps in reserve.'),
    ('ppl-v1-ex-cable-lateral-raise', 'Cable Lateral Raise', 'Side Delts', 'Add 1 plate when 20 reps clean across all sets. Cables maintain tension at peak.'),
    ('ppl-v1-ex-machine-chest-fly', 'Machine Chest Fly', 'Chest', 'Isolation after the compounds. Progress load weekly. RPE 8, 1 rep in reserve.'),
    ('ppl-v1-ex-overhead-tricep-ext', 'Overhead Tricep Extension (Rope)', 'Triceps', 'Long head emphasis — critical for overall tricep size.'),
    ('ppl-v1-ex-tricep-pushdown', 'Tricep Pushdown (Straight Bar)', 'Triceps', 'Final pump set — RPE 9, 0–1 in reserve. Squeeze hard at lockout.'),
    ('ppl-v1-ex-weighted-pull-up', 'Weighted Pull-Up', 'Lats', 'Add 2.5kg belt weight when 8 reps across all sets. Swap for lat pulldown at matched load if needed.'),
    ('ppl-v1-ex-barbell-row', 'Barbell Row (Overhand)', 'Lats', 'Add 5kg when all 4 sets hit 8. Keep the back flat throughout.'),
    ('ppl-v1-ex-seated-cable-row', 'Seated Cable Row (V-Bar)', 'Rhomboids', 'Drive elbows back past the torso. Squeeze 1 second at peak contraction.'),
    ('ppl-v1-ex-rear-delt-fly', 'Rear Delt Fly', 'Rear Delts', 'Never ego lift here. Lighter, strict form, squeeze at peak.'),
    ('ppl-v1-ex-incline-db-curl', 'Incline Dumbbell Curl', 'Biceps', 'Long head bias. Supinate fully at the top.'),
    ('ppl-v1-ex-hammer-curl', 'Hammer Curl', 'Biceps', 'Brachialis and forearm. Alternate weekly with cable hammer curl.'),
    ('ppl-v1-ex-leg-press', 'Leg Press', 'Quads', 'High, wide foot position. Primary compound, done fresh. Add 5–10kg when top of range hit across all 4 sets.'),
    ('ppl-v1-ex-romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'Feel the stretch in the hamstrings at the bottom. Add 5kg at top of range.'),
    ('ppl-v1-ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'Glutes', 'Per leg. Unilateral glute and quad bias. Add DBs at the sides once 12 reps each leg is clean.'),
    ('ppl-v1-ex-leg-extension', 'Leg Extension', 'Quads', 'Direct quad isolation — fills the gap left by no squat. Pause 1 second at the top.'),
    ('ppl-v1-ex-leg-curl', 'Leg Curl', 'Hamstrings', 'Slow eccentric, 3 seconds down. Most hamstring tears come from neglected eccentrics.'),
    ('ppl-v1-ex-standing-calf-raise', 'Standing Calf Raise', 'Calves', 'Slow down, 3 seconds. Stretch fully at the bottom. Full range only.'),
    ('ppl-v1-ex-cable-crunch', 'Cable Crunch', 'Abs', 'Add weight progressively. Swap for ab wheel if the cable station is busy.'),
    ('ppl-v1-ex-seated-db-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Front Delts', 'Primary shoulder strength movement. Add 2kg DBs at top of range.'),
    ('ppl-v1-ex-db-lateral-raise', 'Dumbbell Lateral Raise', 'Side Delts', 'Drop set: 15 reps, then drop and hit 10. Lateral delt volume — no trapezius swing.'),
    ('ppl-v1-ex-cable-chest-press', 'Cable Chest Press (Low to High)', 'Upper Chest', 'Upper chest accessory at a different angle from the Push A bench.'),
    ('ppl-v1-ex-machine-shoulder-press', 'Machine Shoulder Press', 'Front Delts', 'Machine allows controlled load late in the session. Rotates front delt coverage.'),
    ('ppl-v1-ex-skull-crusher', 'Skull Crusher (EZ-Bar)', 'Triceps', 'Long head tricep. Never sacrifice elbow position for weight — RPE 8, 2 in reserve.'),
    ('ppl-v1-ex-dips', 'Dips', 'Lower Chest', 'Lean forward for chest emphasis. Add belt weight once 12 reps is easy.'),
    ('ppl-v1-ex-single-arm-db-row', 'Single-Arm Dumbbell Row', 'Lats', 'Per arm. Heavy and strict — full stretch at the bottom, full retraction at the top.'),
    ('ppl-v1-ex-lat-pulldown', 'Lat Pulldown (Wide Grip)', 'Lats', 'Vary the grip each Pull B to hit different lat fibres.'),
    ('ppl-v1-ex-face-pull', 'Face Pull', 'Rear Delts', 'Rope, with external rotation. Shoulder health is non-negotiable — never skip, never rush.'),
    ('ppl-v1-ex-preacher-curl', 'Preacher Curl', 'Biceps', 'Short head emphasis — good for peak and separation.'),
    ('ppl-v1-ex-cable-curl', 'Cable Curl (Single-Arm, High Pulley)', 'Biceps', 'Long head cable variation — a different angle from the preacher curl.'),
    ('ppl-v1-ex-reverse-barbell-curl', 'Reverse Barbell Curl', 'Forearms', 'Forearm and brachialis — critical for arm thickness.')
  ) as v(id, name, muscle, notes)
  on conflict (id) do nothing;

  -- Rows seeded before notes existed get them filled in, but a note the user
  -- has already written is never overwritten (same rule as ensureProgramSeed).
  update public.exercise_library e
  set notes = v.notes, updated_at = now()
  from (values
    ('ppl-v1-ex-barbell-bench-press', 'Barbell Bench Press', 'Chest', 'Add 2.5kg/side when all 4 sets hit 6 reps. Primary strength movement — log every session.'),
    ('ppl-v1-ex-incline-db-press', 'Incline Dumbbell Press', 'Upper Chest', 'Add 2kg DBs at top of range. Upper chest emphasis. RPE 8, 1–2 reps in reserve.'),
    ('ppl-v1-ex-cable-lateral-raise', 'Cable Lateral Raise', 'Side Delts', 'Add 1 plate when 20 reps clean across all sets. Cables maintain tension at peak.'),
    ('ppl-v1-ex-machine-chest-fly', 'Machine Chest Fly', 'Chest', 'Isolation after the compounds. Progress load weekly. RPE 8, 1 rep in reserve.'),
    ('ppl-v1-ex-overhead-tricep-ext', 'Overhead Tricep Extension (Rope)', 'Triceps', 'Long head emphasis — critical for overall tricep size.'),
    ('ppl-v1-ex-tricep-pushdown', 'Tricep Pushdown (Straight Bar)', 'Triceps', 'Final pump set — RPE 9, 0–1 in reserve. Squeeze hard at lockout.'),
    ('ppl-v1-ex-weighted-pull-up', 'Weighted Pull-Up', 'Lats', 'Add 2.5kg belt weight when 8 reps across all sets. Swap for lat pulldown at matched load if needed.'),
    ('ppl-v1-ex-barbell-row', 'Barbell Row (Overhand)', 'Lats', 'Add 5kg when all 4 sets hit 8. Keep the back flat throughout.'),
    ('ppl-v1-ex-seated-cable-row', 'Seated Cable Row (V-Bar)', 'Rhomboids', 'Drive elbows back past the torso. Squeeze 1 second at peak contraction.'),
    ('ppl-v1-ex-rear-delt-fly', 'Rear Delt Fly', 'Rear Delts', 'Never ego lift here. Lighter, strict form, squeeze at peak.'),
    ('ppl-v1-ex-incline-db-curl', 'Incline Dumbbell Curl', 'Biceps', 'Long head bias. Supinate fully at the top.'),
    ('ppl-v1-ex-hammer-curl', 'Hammer Curl', 'Biceps', 'Brachialis and forearm. Alternate weekly with cable hammer curl.'),
    ('ppl-v1-ex-leg-press', 'Leg Press', 'Quads', 'High, wide foot position. Primary compound, done fresh. Add 5–10kg when top of range hit across all 4 sets.'),
    ('ppl-v1-ex-romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'Feel the stretch in the hamstrings at the bottom. Add 5kg at top of range.'),
    ('ppl-v1-ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'Glutes', 'Per leg. Unilateral glute and quad bias. Add DBs at the sides once 12 reps each leg is clean.'),
    ('ppl-v1-ex-leg-extension', 'Leg Extension', 'Quads', 'Direct quad isolation — fills the gap left by no squat. Pause 1 second at the top.'),
    ('ppl-v1-ex-leg-curl', 'Leg Curl', 'Hamstrings', 'Slow eccentric, 3 seconds down. Most hamstring tears come from neglected eccentrics.'),
    ('ppl-v1-ex-standing-calf-raise', 'Standing Calf Raise', 'Calves', 'Slow down, 3 seconds. Stretch fully at the bottom. Full range only.'),
    ('ppl-v1-ex-cable-crunch', 'Cable Crunch', 'Abs', 'Add weight progressively. Swap for ab wheel if the cable station is busy.'),
    ('ppl-v1-ex-seated-db-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Front Delts', 'Primary shoulder strength movement. Add 2kg DBs at top of range.'),
    ('ppl-v1-ex-db-lateral-raise', 'Dumbbell Lateral Raise', 'Side Delts', 'Drop set: 15 reps, then drop and hit 10. Lateral delt volume — no trapezius swing.'),
    ('ppl-v1-ex-cable-chest-press', 'Cable Chest Press (Low to High)', 'Upper Chest', 'Upper chest accessory at a different angle from the Push A bench.'),
    ('ppl-v1-ex-machine-shoulder-press', 'Machine Shoulder Press', 'Front Delts', 'Machine allows controlled load late in the session. Rotates front delt coverage.'),
    ('ppl-v1-ex-skull-crusher', 'Skull Crusher (EZ-Bar)', 'Triceps', 'Long head tricep. Never sacrifice elbow position for weight — RPE 8, 2 in reserve.'),
    ('ppl-v1-ex-dips', 'Dips', 'Lower Chest', 'Lean forward for chest emphasis. Add belt weight once 12 reps is easy.'),
    ('ppl-v1-ex-single-arm-db-row', 'Single-Arm Dumbbell Row', 'Lats', 'Per arm. Heavy and strict — full stretch at the bottom, full retraction at the top.'),
    ('ppl-v1-ex-lat-pulldown', 'Lat Pulldown (Wide Grip)', 'Lats', 'Vary the grip each Pull B to hit different lat fibres.'),
    ('ppl-v1-ex-face-pull', 'Face Pull', 'Rear Delts', 'Rope, with external rotation. Shoulder health is non-negotiable — never skip, never rush.'),
    ('ppl-v1-ex-preacher-curl', 'Preacher Curl', 'Biceps', 'Short head emphasis — good for peak and separation.'),
    ('ppl-v1-ex-cable-curl', 'Cable Curl (Single-Arm, High Pulley)', 'Biceps', 'Long head cable variation — a different angle from the preacher curl.'),
    ('ppl-v1-ex-reverse-barbell-curl', 'Reverse Barbell Curl', 'Forearms', 'Forearm and brachialis — critical for arm thickness.')
  ) as v(id, name, muscle, notes)
  where e.id = v.id and e.user_id = target_user
    and (e.notes is null or e.notes = '');

  insert into public.templates (id, user_id, name, exercises, position, notes, updated_at)
  select v.id, target_user, v.name, v.exercises, v.position, v.notes, seeded_at
  from (values
    ('ppl-v1-push-a', 'Push A', '[{"exerciseId":"ppl-v1-ex-barbell-bench-press","order":0,"targetSets":4,"repsMin":5,"repsMax":6,"targetWeight":0,"restSeconds":210},{"exerciseId":"ppl-v1-ex-incline-db-press","order":1,"targetSets":3,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-cable-lateral-raise","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-machine-chest-fly","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-overhead-tricep-ext","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-tricep-pushdown","order":5,"targetSets":3,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":60}]'::jsonb, 0, 'Chest / Shoulders / Triceps — strength bias: lower reps, heavier load, longer rest. Progressive overload every session; log every set. If you hit 4×6 at 100kg last week, aim for 4×6 at 102.5kg or 4×7 at 100kg today.'),
    ('ppl-v1-pull-a', 'Pull A', '[{"exerciseId":"ppl-v1-ex-weighted-pull-up","order":0,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-barbell-row","order":1,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-seated-cable-row","order":2,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-rear-delt-fly","order":3,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-incline-db-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-hammer-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75}]'::jsonb, 1, 'Lats / Upper Back / Rear Delts / Biceps — hypertrophy bias. Heavy compounds first while fresh, then strict isolation. Never ego lift the rear delt work.'),
    ('ppl-v1-legs', 'Legs', '[{"exerciseId":"ppl-v1-ex-leg-press","order":0,"targetSets":4,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":165},{"exerciseId":"ppl-v1-ex-romanian-deadlift","order":1,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-bulgarian-split-squat","order":2,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-leg-extension","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-leg-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-standing-calf-raise","order":5,"targetSets":4,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":60},{"exerciseId":"ppl-v1-ex-cable-crunch","order":6,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 2, 'Quads / Hamstrings / Glutes / Calves / Core — no-squat variation. Leg press leads while you are fresh, RDLs second (highest systemic demand after it). Leg extensions fill the gap left by skipping squats.'),
    ('ppl-v1-push-b', 'Push B', '[{"exerciseId":"ppl-v1-ex-seated-db-shoulder-press","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-db-lateral-raise","order":1,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-chest-press","order":2,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-machine-shoulder-press","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-skull-crusher","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-dips","order":5,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120}]'::jsonb, 3, 'Shoulders emphasis / Chest accessory / Triceps — volume bias: more sets, higher reps, pump work. Together with the A days this drives both myofibrillar and sarcoplasmic hypertrophy.'),
    ('ppl-v1-pull-b', 'Pull B', '[{"exerciseId":"ppl-v1-ex-single-arm-db-row","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-lat-pulldown","order":1,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-face-pull","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-preacher-curl","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-curl","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-reverse-barbell-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 4, 'Lats emphasis / Rear Delts / Biceps peak / Forearms — volume bias. Face pulls are shoulder health: never skip them, never rush them.')
  ) as v(id, name, exercises, position, notes)
  on conflict (id) do nothing;

  update public.templates t
  set notes = v.notes, updated_at = now()
  from (values
    ('ppl-v1-push-a', 'Push A', '[{"exerciseId":"ppl-v1-ex-barbell-bench-press","order":0,"targetSets":4,"repsMin":5,"repsMax":6,"targetWeight":0,"restSeconds":210},{"exerciseId":"ppl-v1-ex-incline-db-press","order":1,"targetSets":3,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-cable-lateral-raise","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-machine-chest-fly","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-overhead-tricep-ext","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-tricep-pushdown","order":5,"targetSets":3,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":60}]'::jsonb, 0, 'Chest / Shoulders / Triceps — strength bias: lower reps, heavier load, longer rest. Progressive overload every session; log every set. If you hit 4×6 at 100kg last week, aim for 4×6 at 102.5kg or 4×7 at 100kg today.'),
    ('ppl-v1-pull-a', 'Pull A', '[{"exerciseId":"ppl-v1-ex-weighted-pull-up","order":0,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-barbell-row","order":1,"targetSets":4,"repsMin":6,"repsMax":8,"targetWeight":0,"restSeconds":180},{"exerciseId":"ppl-v1-ex-seated-cable-row","order":2,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-rear-delt-fly","order":3,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-incline-db-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-hammer-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75}]'::jsonb, 1, 'Lats / Upper Back / Rear Delts / Biceps — hypertrophy bias. Heavy compounds first while fresh, then strict isolation. Never ego lift the rear delt work.'),
    ('ppl-v1-legs', 'Legs', '[{"exerciseId":"ppl-v1-ex-leg-press","order":0,"targetSets":4,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":165},{"exerciseId":"ppl-v1-ex-romanian-deadlift","order":1,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-bulgarian-split-squat","order":2,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-leg-extension","order":3,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-leg-curl","order":4,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-standing-calf-raise","order":5,"targetSets":4,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":60},{"exerciseId":"ppl-v1-ex-cable-crunch","order":6,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 2, 'Quads / Hamstrings / Glutes / Calves / Core — no-squat variation. Leg press leads while you are fresh, RDLs second (highest systemic demand after it). Leg extensions fill the gap left by skipping squats.'),
    ('ppl-v1-push-b', 'Push B', '[{"exerciseId":"ppl-v1-ex-seated-db-shoulder-press","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":150},{"exerciseId":"ppl-v1-ex-db-lateral-raise","order":1,"targetSets":3,"repsMin":10,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-chest-press","order":2,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-machine-shoulder-press","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-skull-crusher","order":4,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-dips","order":5,"targetSets":3,"repsMin":8,"repsMax":12,"targetWeight":0,"restSeconds":120}]'::jsonb, 3, 'Shoulders emphasis / Chest accessory / Triceps — volume bias: more sets, higher reps, pump work. Together with the A days this drives both myofibrillar and sarcoplasmic hypertrophy.'),
    ('ppl-v1-pull-b', 'Pull B', '[{"exerciseId":"ppl-v1-ex-single-arm-db-row","order":0,"targetSets":4,"repsMin":8,"repsMax":10,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-lat-pulldown","order":1,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":120},{"exerciseId":"ppl-v1-ex-face-pull","order":2,"targetSets":4,"repsMin":15,"repsMax":20,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-preacher-curl","order":3,"targetSets":3,"repsMin":10,"repsMax":12,"targetWeight":0,"restSeconds":90},{"exerciseId":"ppl-v1-ex-cable-curl","order":4,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":75},{"exerciseId":"ppl-v1-ex-reverse-barbell-curl","order":5,"targetSets":3,"repsMin":12,"repsMax":15,"targetWeight":0,"restSeconds":60}]'::jsonb, 4, 'Lats emphasis / Rear Delts / Biceps peak / Forearms — volume bias. Face pulls are shoulder health: never skip them, never rush them.')
  ) as v(id, name, exercises, position, notes)
  where t.id = v.id and t.user_id = target_user
    and (t.notes is null or t.notes = '');
end $$;

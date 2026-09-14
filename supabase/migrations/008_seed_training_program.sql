-- Seeds the 5-day Push/Pull/Legs training program from the body
-- recomposition plan. Training only — the plan's nutrition, cardio and
-- check-in sections have no table to live in.
--
-- Requires 006_add_notes_columns.sql and 007_per_user_record_ids.sql first.
--
-- Set target_email below to one account's email, or leave it null to seed
-- every account. To see the real addresses: select email from auth.users;
--
-- Safe to re-run: "on conflict do nothing" means it will not overwrite loads,
-- rep ranges or reordering you have changed in the app, and the notes
-- backfill skips any note you have written yourself. Rows are stamped now()
-- because the client only pulls rows newer than its last-synced watermark.

do $$
declare
  -- The account to seed, by the email on its auth.users row.
  -- Leave null to seed every account in this project.
  target_email text := null;

  seeded_at constant timestamptz := now();
  matched int;
begin
  select count(*) into matched from auth.users u
  where target_email is null or u.email = target_email;

  if matched = 0 then
    raise exception 'No auth.users row matches %  — run: select email from auth.users;', target_email;
  end if;
  raise notice 'Seeding the training program for % account(s).', matched;

  -- The program, held in temp tables so each value is written once. They are
  -- dropped when this block commits.
  create temporary table seed_exercise (
    id text primary key, name text, muscle text, notes text
  ) on commit drop;
  insert into seed_exercise values
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
  ('ppl-v1-ex-reverse-barbell-curl', 'Reverse Barbell Curl', 'Forearms', 'Forearm and brachialis — critical for arm thickness.');

  create temporary table seed_slot (
    template_id text, exercise_id text, position int,
    sets int, reps_min int, reps_max int, rest_seconds int
  ) on commit drop;
  insert into seed_slot values
  ('ppl-v1-push-a', 'ppl-v1-ex-barbell-bench-press', 0, 4, 5, 6, 210),
  ('ppl-v1-push-a', 'ppl-v1-ex-incline-db-press', 1, 3, 8, 10, 150),
  ('ppl-v1-push-a', 'ppl-v1-ex-cable-lateral-raise', 2, 4, 15, 20, 75),
  ('ppl-v1-push-a', 'ppl-v1-ex-machine-chest-fly', 3, 3, 12, 15, 90),
  ('ppl-v1-push-a', 'ppl-v1-ex-overhead-tricep-ext', 4, 3, 12, 15, 90),
  ('ppl-v1-push-a', 'ppl-v1-ex-tricep-pushdown', 5, 3, 15, 20, 60),
  ('ppl-v1-pull-a', 'ppl-v1-ex-weighted-pull-up', 0, 4, 6, 8, 180),
  ('ppl-v1-pull-a', 'ppl-v1-ex-barbell-row', 1, 4, 6, 8, 180),
  ('ppl-v1-pull-a', 'ppl-v1-ex-seated-cable-row', 2, 3, 10, 12, 120),
  ('ppl-v1-pull-a', 'ppl-v1-ex-rear-delt-fly', 3, 4, 15, 20, 75),
  ('ppl-v1-pull-a', 'ppl-v1-ex-incline-db-curl', 4, 3, 10, 12, 90),
  ('ppl-v1-pull-a', 'ppl-v1-ex-hammer-curl', 5, 3, 12, 15, 75),
  ('ppl-v1-legs', 'ppl-v1-ex-leg-press', 0, 4, 8, 12, 165),
  ('ppl-v1-legs', 'ppl-v1-ex-romanian-deadlift', 1, 4, 8, 10, 150),
  ('ppl-v1-legs', 'ppl-v1-ex-bulgarian-split-squat', 2, 3, 8, 12, 120),
  ('ppl-v1-legs', 'ppl-v1-ex-leg-extension', 3, 3, 12, 15, 90),
  ('ppl-v1-legs', 'ppl-v1-ex-leg-curl', 4, 3, 10, 15, 90),
  ('ppl-v1-legs', 'ppl-v1-ex-standing-calf-raise', 5, 4, 10, 15, 60),
  ('ppl-v1-legs', 'ppl-v1-ex-cable-crunch', 6, 3, 12, 15, 60),
  ('ppl-v1-push-b', 'ppl-v1-ex-seated-db-shoulder-press', 0, 4, 8, 10, 150),
  ('ppl-v1-push-b', 'ppl-v1-ex-db-lateral-raise', 1, 3, 10, 15, 90),
  ('ppl-v1-push-b', 'ppl-v1-ex-cable-chest-press', 2, 3, 12, 15, 90),
  ('ppl-v1-push-b', 'ppl-v1-ex-machine-shoulder-press', 3, 3, 10, 12, 90),
  ('ppl-v1-push-b', 'ppl-v1-ex-skull-crusher', 4, 3, 10, 12, 90),
  ('ppl-v1-push-b', 'ppl-v1-ex-dips', 5, 3, 8, 12, 120),
  ('ppl-v1-pull-b', 'ppl-v1-ex-single-arm-db-row', 0, 4, 8, 10, 120),
  ('ppl-v1-pull-b', 'ppl-v1-ex-lat-pulldown', 1, 3, 10, 12, 120),
  ('ppl-v1-pull-b', 'ppl-v1-ex-face-pull', 2, 4, 15, 20, 75),
  ('ppl-v1-pull-b', 'ppl-v1-ex-preacher-curl', 3, 3, 10, 12, 90),
  ('ppl-v1-pull-b', 'ppl-v1-ex-cable-curl', 4, 3, 12, 15, 75),
  ('ppl-v1-pull-b', 'ppl-v1-ex-reverse-barbell-curl', 5, 3, 12, 15, 60);

  create temporary table seed_template (
    id text primary key, name text, position int, notes text
  ) on commit drop;
  insert into seed_template values
  ('ppl-v1-push-a', 'Push A', 0, 'Chest / Shoulders / Triceps — strength bias: lower reps, heavier load, longer rest. Progressive overload every session; log every set. If you hit 4×6 at 100kg last week, aim for 4×6 at 102.5kg or 4×7 at 100kg today.'),
  ('ppl-v1-pull-a', 'Pull A', 1, 'Lats / Upper Back / Rear Delts / Biceps — hypertrophy bias. Heavy compounds first while fresh, then strict isolation. Never ego lift the rear delt work.'),
  ('ppl-v1-legs', 'Legs', 2, 'Quads / Hamstrings / Glutes / Calves / Core — no-squat variation. Leg press leads while you are fresh, RDLs second (highest systemic demand after it). Leg extensions fill the gap left by skipping squats.'),
  ('ppl-v1-push-b', 'Push B', 3, 'Shoulders emphasis / Chest accessory / Triceps — volume bias: more sets, higher reps, pump work. Together with the A days this drives both myofibrillar and sarcoplasmic hypertrophy.'),
  ('ppl-v1-pull-b', 'Pull B', 4, 'Lats emphasis / Rear Delts / Biceps peak / Forearms — volume bias. Face pulls are shoulder health: never skip them, never rush them.');

  insert into public.exercise_library (id, user_id, name, muscle, notes, updated_at)
  select s.id, u.id, s.name, s.muscle, s.notes, seeded_at
  from seed_exercise s
  cross join auth.users u
  where target_email is null or u.email = target_email
  on conflict (user_id, id) do nothing;

  -- Rows seeded before notes existed get them filled in; a note the user has
  -- already written is never overwritten (same rule as ensureProgramSeed).
  update public.exercise_library e
  set notes = s.notes, updated_at = now()
  from seed_exercise s, auth.users u
  where e.id = s.id and e.user_id = u.id
    and (target_email is null or u.email = target_email)
    and (e.notes is null or e.notes = '');

  insert into public.templates (id, user_id, name, exercises, position, notes, updated_at)
  select t.id, u.id, t.name,
    (select jsonb_agg(jsonb_build_object(
              'exerciseId', sl.exercise_id,
              'order', sl.position,
              'targetSets', sl.sets,
              'repsMin', sl.reps_min,
              'repsMax', sl.reps_max,
              'targetWeight', 0,
              'restSeconds', sl.rest_seconds
            ) order by sl.position)
     from seed_slot sl where sl.template_id = t.id),
    t.position, t.notes, seeded_at
  from seed_template t
  cross join auth.users u
  where target_email is null or u.email = target_email
  on conflict (user_id, id) do nothing;

  update public.templates tp
  set notes = t.notes, updated_at = now()
  from seed_template t, auth.users u
  where tp.id = t.id and tp.user_id = u.id
    and (target_email is null or u.email = target_email)
    and (tp.notes is null or tp.notes = '');
end $$;

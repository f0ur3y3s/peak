// Seeded training program — the 5-day Push/Pull/Legs split from the body
// recomposition plan. Training only: the plan's nutrition, cardio and
// check-in sections have no home in this app's data model and are not
// seeded here. The plan's per-exercise progression rules and per-day focus
// ride along as notes.
//
// Ids are deterministic (not random UUIDs) so that seeding the same program
// on a second device, or straight into Postgres via
// `supabase/migrations/007_seed_training_program.sql`, converges on the same
// rows through the sync engine's upsert instead of creating duplicates.
// This matches the fixed-id precedent set by the original "e1"/"e2"/"e3"
// seed library that migration 003 relaxed the id columns for.

export interface SeedProgramExercise {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  notes: string;
}

export interface SeedProgramTemplate {
  id: string;
  name: string;
  notes: string;
  exercises: SeedProgramExercise[];
}

/**
 * Bumping this re-runs the seed once on every device. A re-run never
 * overwrites a record that already exists — it only fills in notes that are
 * still empty, so v1 devices pick up the progression notes added in v2
 * without losing anything the user changed.
 */
export const PROGRAM_SEED_VERSION = "recomp-ppl-v2";

// The plan prescribes sets, rep ranges and rest, but no loads — those are
// personal and get set on the first session, so every exercise seeds at 0kg.
export const PROGRAM_SEED_WEIGHT = 0;

export const SEED_PROGRAM: SeedProgramTemplate[] = [
  {
    id: "ppl-v1-push-a",
    name: "Push A",
    notes:
      "Chest / Shoulders / Triceps — strength bias: lower reps, heavier load, longer rest. Progressive overload every session; log every set. If you hit 4×6 at 100kg last week, aim for 4×6 at 102.5kg or 4×7 at 100kg today.",
    exercises: [
      {
        id: "ppl-v1-ex-barbell-bench-press",
        name: "Barbell Bench Press",
        muscle: "Chest",
        targetSets: 4,
        repsMin: 5,
        repsMax: 6,
        restSeconds: 210,
        notes: "Add 2.5kg/side when all 4 sets hit 6 reps. Primary strength movement — log every session.",
      },
      {
        id: "ppl-v1-ex-incline-db-press",
        name: "Incline Dumbbell Press",
        muscle: "Upper Chest",
        targetSets: 3,
        repsMin: 8,
        repsMax: 10,
        restSeconds: 150,
        notes: "Add 2kg DBs at top of range. Upper chest emphasis. RPE 8, 1–2 reps in reserve.",
      },
      {
        id: "ppl-v1-ex-cable-lateral-raise",
        name: "Cable Lateral Raise",
        muscle: "Side Delts",
        targetSets: 4,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 75,
        notes: "Add 1 plate when 20 reps clean across all sets. Cables maintain tension at peak.",
      },
      {
        id: "ppl-v1-ex-machine-chest-fly",
        name: "Machine Chest Fly",
        muscle: "Chest",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 90,
        notes: "Isolation after the compounds. Progress load weekly. RPE 8, 1 rep in reserve.",
      },
      {
        id: "ppl-v1-ex-overhead-tricep-ext",
        name: "Overhead Tricep Extension (Rope)",
        muscle: "Triceps",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 90,
        notes: "Long head emphasis — critical for overall tricep size.",
      },
      {
        id: "ppl-v1-ex-tricep-pushdown",
        name: "Tricep Pushdown (Straight Bar)",
        muscle: "Triceps",
        targetSets: 3,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 60,
        notes: "Final pump set — RPE 9, 0–1 in reserve. Squeeze hard at lockout.",
      },
    ],
  },
  {
    id: "ppl-v1-pull-a",
    name: "Pull A",
    notes:
      "Lats / Upper Back / Rear Delts / Biceps — hypertrophy bias. Heavy compounds first while fresh, then strict isolation. Never ego lift the rear delt work.",
    exercises: [
      {
        id: "ppl-v1-ex-weighted-pull-up",
        name: "Weighted Pull-Up",
        muscle: "Lats",
        targetSets: 4,
        repsMin: 6,
        repsMax: 8,
        restSeconds: 180,
        notes: "Add 2.5kg belt weight when 8 reps across all sets. Swap for lat pulldown at matched load if needed.",
      },
      {
        id: "ppl-v1-ex-barbell-row",
        name: "Barbell Row (Overhand)",
        muscle: "Lats",
        targetSets: 4,
        repsMin: 6,
        repsMax: 8,
        restSeconds: 180,
        notes: "Add 5kg when all 4 sets hit 8. Keep the back flat throughout.",
      },
      {
        id: "ppl-v1-ex-seated-cable-row",
        name: "Seated Cable Row (V-Bar)",
        muscle: "Rhomboids",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 120,
        notes: "Drive elbows back past the torso. Squeeze 1 second at peak contraction.",
      },
      {
        id: "ppl-v1-ex-rear-delt-fly",
        name: "Rear Delt Fly",
        muscle: "Rear Delts",
        targetSets: 4,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 75,
        notes: "Never ego lift here. Lighter, strict form, squeeze at peak.",
      },
      {
        id: "ppl-v1-ex-incline-db-curl",
        name: "Incline Dumbbell Curl",
        muscle: "Biceps",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 90,
        notes: "Long head bias. Supinate fully at the top.",
      },
      {
        id: "ppl-v1-ex-hammer-curl",
        name: "Hammer Curl",
        muscle: "Biceps",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 75,
        notes: "Brachialis and forearm. Alternate weekly with cable hammer curl.",
      },
    ],
  },
  {
    id: "ppl-v1-legs",
    name: "Legs",
    notes:
      "Quads / Hamstrings / Glutes / Calves / Core — no-squat variation. Leg press leads while you are fresh, RDLs second (highest systemic demand after it). Leg extensions fill the gap left by skipping squats.",
    exercises: [
      {
        id: "ppl-v1-ex-leg-press",
        name: "Leg Press",
        muscle: "Quads",
        targetSets: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 165,
        notes: "High, wide foot position. Primary compound, done fresh. Add 5–10kg when top of range hit across all 4 sets.",
      },
      {
        id: "ppl-v1-ex-romanian-deadlift",
        name: "Romanian Deadlift",
        muscle: "Hamstrings",
        targetSets: 4,
        repsMin: 8,
        repsMax: 10,
        restSeconds: 150,
        notes: "Feel the stretch in the hamstrings at the bottom. Add 5kg at top of range.",
      },
      {
        id: "ppl-v1-ex-bulgarian-split-squat",
        name: "Bulgarian Split Squat",
        muscle: "Glutes",
        targetSets: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 120,
        notes: "Per leg. Unilateral glute and quad bias. Add DBs at the sides once 12 reps each leg is clean.",
      },
      {
        id: "ppl-v1-ex-leg-extension",
        name: "Leg Extension",
        muscle: "Quads",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 90,
        notes: "Direct quad isolation — fills the gap left by no squat. Pause 1 second at the top.",
      },
      {
        id: "ppl-v1-ex-leg-curl",
        name: "Leg Curl",
        muscle: "Hamstrings",
        targetSets: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 90,
        notes: "Slow eccentric, 3 seconds down. Most hamstring tears come from neglected eccentrics.",
      },
      {
        id: "ppl-v1-ex-standing-calf-raise",
        name: "Standing Calf Raise",
        muscle: "Calves",
        targetSets: 4,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 60,
        notes: "Slow down, 3 seconds. Stretch fully at the bottom. Full range only.",
      },
      {
        id: "ppl-v1-ex-cable-crunch",
        name: "Cable Crunch",
        muscle: "Abs",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 60,
        notes: "Add weight progressively. Swap for ab wheel if the cable station is busy.",
      },
    ],
  },
  {
    id: "ppl-v1-push-b",
    name: "Push B",
    notes:
      "Shoulders emphasis / Chest accessory / Triceps — volume bias: more sets, higher reps, pump work. Together with the A days this drives both myofibrillar and sarcoplasmic hypertrophy.",
    exercises: [
      {
        id: "ppl-v1-ex-seated-db-shoulder-press",
        name: "Seated Dumbbell Shoulder Press",
        muscle: "Front Delts",
        targetSets: 4,
        repsMin: 8,
        repsMax: 10,
        restSeconds: 150,
        notes: "Primary shoulder strength movement. Add 2kg DBs at top of range.",
      },
      {
        id: "ppl-v1-ex-db-lateral-raise",
        name: "Dumbbell Lateral Raise",
        muscle: "Side Delts",
        targetSets: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 90,
        notes: "Drop set: 15 reps, then drop and hit 10. Lateral delt volume — no trapezius swing.",
      },
      {
        id: "ppl-v1-ex-cable-chest-press",
        name: "Cable Chest Press (Low to High)",
        muscle: "Upper Chest",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 90,
        notes: "Upper chest accessory at a different angle from the Push A bench.",
      },
      {
        id: "ppl-v1-ex-machine-shoulder-press",
        name: "Machine Shoulder Press",
        muscle: "Front Delts",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 90,
        notes: "Machine allows controlled load late in the session. Rotates front delt coverage.",
      },
      {
        id: "ppl-v1-ex-skull-crusher",
        name: "Skull Crusher (EZ-Bar)",
        muscle: "Triceps",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 90,
        notes: "Long head tricep. Never sacrifice elbow position for weight — RPE 8, 2 in reserve.",
      },
      {
        id: "ppl-v1-ex-dips",
        name: "Dips",
        muscle: "Lower Chest",
        targetSets: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 120,
        notes: "Lean forward for chest emphasis. Add belt weight once 12 reps is easy.",
      },
    ],
  },
  {
    id: "ppl-v1-pull-b",
    name: "Pull B",
    notes:
      "Lats emphasis / Rear Delts / Biceps peak / Forearms — volume bias. Face pulls are shoulder health: never skip them, never rush them.",
    exercises: [
      {
        id: "ppl-v1-ex-single-arm-db-row",
        name: "Single-Arm Dumbbell Row",
        muscle: "Lats",
        targetSets: 4,
        repsMin: 8,
        repsMax: 10,
        restSeconds: 120,
        notes: "Per arm. Heavy and strict — full stretch at the bottom, full retraction at the top.",
      },
      {
        id: "ppl-v1-ex-lat-pulldown",
        name: "Lat Pulldown (Wide Grip)",
        muscle: "Lats",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 120,
        notes: "Vary the grip each Pull B to hit different lat fibres.",
      },
      {
        id: "ppl-v1-ex-face-pull",
        name: "Face Pull",
        muscle: "Rear Delts",
        targetSets: 4,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 75,
        notes: "Rope, with external rotation. Shoulder health is non-negotiable — never skip, never rush.",
      },
      {
        id: "ppl-v1-ex-preacher-curl",
        name: "Preacher Curl",
        muscle: "Biceps",
        targetSets: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 90,
        notes: "Short head emphasis — good for peak and separation.",
      },
      {
        id: "ppl-v1-ex-cable-curl",
        name: "Cable Curl (Single-Arm, High Pulley)",
        muscle: "Biceps",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 75,
        notes: "Long head cable variation — a different angle from the preacher curl.",
      },
      {
        id: "ppl-v1-ex-reverse-barbell-curl",
        name: "Reverse Barbell Curl",
        muscle: "Forearms",
        targetSets: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 60,
        notes: "Forearm and brachialis — critical for arm thickness.",
      },
    ],
  },
];

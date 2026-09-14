// Seeded training program — the 5-day Push/Pull/Legs split from the body
// recomposition plan. Training only: the plan's nutrition, cardio and
// check-in sections have no home in this app's data model and are not
// seeded here.
//
// Ids are deterministic (not random UUIDs) so that seeding the same program
// on a second device, or straight into Postgres via
// `supabase/migrations/006_seed_training_program.sql`, converges on the same
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
}

export interface SeedProgramTemplate {
  id: string;
  name: string;
  exercises: SeedProgramExercise[];
}

/** Bumping this re-seeds every device once (the applied marker is keyed by it). */
export const PROGRAM_SEED_VERSION = "recomp-ppl-v1";

// The plan prescribes sets, rep ranges and rest, but no loads — those are
// personal and get set on the first session, so every exercise seeds at 0kg.
export const PROGRAM_SEED_WEIGHT = 0;

export const SEED_PROGRAM: SeedProgramTemplate[] = [
  {
    id: "ppl-v1-push-a",
    name: "Push A",
    exercises: [
      { id: "ppl-v1-ex-barbell-bench-press", name: "Barbell Bench Press", muscle: "Chest", targetSets: 4, repsMin: 5, repsMax: 6, restSeconds: 210 },
      { id: "ppl-v1-ex-incline-db-press", name: "Incline Dumbbell Press", muscle: "Upper Chest", targetSets: 3, repsMin: 8, repsMax: 10, restSeconds: 150 },
      { id: "ppl-v1-ex-cable-lateral-raise", name: "Cable Lateral Raise", muscle: "Side Delts", targetSets: 4, repsMin: 15, repsMax: 20, restSeconds: 75 },
      { id: "ppl-v1-ex-machine-chest-fly", name: "Machine Chest Fly", muscle: "Chest", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-overhead-tricep-ext", name: "Overhead Tricep Extension (Rope)", muscle: "Triceps", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-tricep-pushdown", name: "Tricep Pushdown (Straight Bar)", muscle: "Triceps", targetSets: 3, repsMin: 15, repsMax: 20, restSeconds: 60 },
    ],
  },
  {
    id: "ppl-v1-pull-a",
    name: "Pull A",
    exercises: [
      { id: "ppl-v1-ex-weighted-pull-up", name: "Weighted Pull-Up", muscle: "Lats", targetSets: 4, repsMin: 6, repsMax: 8, restSeconds: 180 },
      { id: "ppl-v1-ex-barbell-row", name: "Barbell Row (Overhand)", muscle: "Lats", targetSets: 4, repsMin: 6, repsMax: 8, restSeconds: 180 },
      { id: "ppl-v1-ex-seated-cable-row", name: "Seated Cable Row (V-Bar)", muscle: "Rhomboids", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 120 },
      { id: "ppl-v1-ex-rear-delt-fly", name: "Rear Delt Fly", muscle: "Rear Delts", targetSets: 4, repsMin: 15, repsMax: 20, restSeconds: 75 },
      { id: "ppl-v1-ex-incline-db-curl", name: "Incline Dumbbell Curl", muscle: "Biceps", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
      { id: "ppl-v1-ex-hammer-curl", name: "Hammer Curl", muscle: "Biceps", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 75 },
    ],
  },
  {
    id: "ppl-v1-legs",
    name: "Legs",
    exercises: [
      { id: "ppl-v1-ex-leg-press", name: "Leg Press", muscle: "Quads", targetSets: 4, repsMin: 8, repsMax: 12, restSeconds: 165 },
      { id: "ppl-v1-ex-romanian-deadlift", name: "Romanian Deadlift", muscle: "Hamstrings", targetSets: 4, repsMin: 8, repsMax: 10, restSeconds: 150 },
      { id: "ppl-v1-ex-bulgarian-split-squat", name: "Bulgarian Split Squat", muscle: "Glutes", targetSets: 3, repsMin: 8, repsMax: 12, restSeconds: 120 },
      { id: "ppl-v1-ex-leg-extension", name: "Leg Extension", muscle: "Quads", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-leg-curl", name: "Leg Curl", muscle: "Hamstrings", targetSets: 3, repsMin: 10, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-standing-calf-raise", name: "Standing Calf Raise", muscle: "Calves", targetSets: 4, repsMin: 10, repsMax: 15, restSeconds: 60 },
      { id: "ppl-v1-ex-cable-crunch", name: "Cable Crunch", muscle: "Abs", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
    ],
  },
  {
    id: "ppl-v1-push-b",
    name: "Push B",
    exercises: [
      { id: "ppl-v1-ex-seated-db-shoulder-press", name: "Seated Dumbbell Shoulder Press", muscle: "Front Delts", targetSets: 4, repsMin: 8, repsMax: 10, restSeconds: 150 },
      { id: "ppl-v1-ex-db-lateral-raise", name: "Dumbbell Lateral Raise", muscle: "Side Delts", targetSets: 3, repsMin: 10, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-cable-chest-press", name: "Cable Chest Press (Low to High)", muscle: "Upper Chest", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { id: "ppl-v1-ex-machine-shoulder-press", name: "Machine Shoulder Press", muscle: "Front Delts", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
      { id: "ppl-v1-ex-skull-crusher", name: "Skull Crusher (EZ-Bar)", muscle: "Triceps", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
      { id: "ppl-v1-ex-dips", name: "Dips", muscle: "Lower Chest", targetSets: 3, repsMin: 8, repsMax: 12, restSeconds: 120 },
    ],
  },
  {
    id: "ppl-v1-pull-b",
    name: "Pull B",
    exercises: [
      { id: "ppl-v1-ex-single-arm-db-row", name: "Single-Arm Dumbbell Row", muscle: "Lats", targetSets: 4, repsMin: 8, repsMax: 10, restSeconds: 120 },
      { id: "ppl-v1-ex-lat-pulldown", name: "Lat Pulldown (Wide Grip)", muscle: "Lats", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 120 },
      { id: "ppl-v1-ex-face-pull", name: "Face Pull", muscle: "Rear Delts", targetSets: 4, repsMin: 15, repsMax: 20, restSeconds: 75 },
      { id: "ppl-v1-ex-preacher-curl", name: "Preacher Curl", muscle: "Biceps", targetSets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
      { id: "ppl-v1-ex-cable-curl", name: "Cable Curl (Single-Arm, High Pulley)", muscle: "Biceps", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 75 },
      { id: "ppl-v1-ex-reverse-barbell-curl", name: "Reverse Barbell Curl", muscle: "Forearms", targetSets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
    ],
  },
];

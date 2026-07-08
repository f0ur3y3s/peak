// ── Types ─────────────────────────────────────────────────────────────────────

export interface LastSet {
  r: number;
  w: number;
}

export interface LoggedSet {
  id: string;
  reps: number;
  weight: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
  last: LastSet[] | null;
  logged: LoggedSet[];
}

export interface TimerState {
  seconds: number;
  exerciseName: string;
  nextSet: string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

export const SEED_EXERCISES: Exercise[] = [
  {
    id: "e1",
    name: "Bench Press",
    muscle: "Chest",
    targetSets: 4,
    repsMin: 6,
    repsMax: 8,
    targetWeight: 100,
    restSeconds: 180,
    last: [{ r: 7, w: 100 }, { r: 7, w: 100 }, { r: 6, w: 100 }, { r: 5, w: 100 }],
    logged: [
      { id: "a", reps: 7, weight: 100 },
      { id: "b", reps: 7, weight: 100 },
    ],
  },
  {
    id: "e2",
    name: "Incline DB Press",
    muscle: "Chest",
    targetSets: 3,
    repsMin: 8,
    repsMax: 12,
    targetWeight: 32,
    restSeconds: 120,
    last: [{ r: 12, w: 30 }, { r: 11, w: 30 }, { r: 10, w: 30 }],
    logged: [],
  },
  {
    id: "e3",
    name: "Tricep Pushdown",
    muscle: "Triceps",
    targetSets: 3,
    repsMin: 12,
    repsMax: 15,
    targetWeight: 40,
    restSeconds: 90,
    last: null,
    logged: [],
  },
];

// ── Utils ─────────────────────────────────────────────────────────────────────

export const fmtTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

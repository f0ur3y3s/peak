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

// Seed data now lives in src/lib/seedProgram.ts (the 5-day Push/Pull/Legs
// training program) and is applied by ensureProgramSeed() in src/lib/db.ts.
// The old three-exercise "Push Day A" demo seed that lived here was replaced
// by it.

// ── Utils ─────────────────────────────────────────────────────────────────────

export const fmtTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

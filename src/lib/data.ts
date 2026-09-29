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
  /** Mirrors LibraryExercise.notes — form cues, setup, progression rules. */
  notes?: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
  last: LastSet[] | null;
  logged: LoggedSet[];
}

/**
 * A rest period. The deadline is the single source of truth for how much rest
 * is left: the on-screen countdown, the ±30s buttons and the locked-screen
 * push all read or move this one value. (They used to keep one each, so a
 * "+30s" moved the countdown but not the push, which arrived 30s early.)
 */
export interface TimerState {
  /** Wall-clock deadline (ms). Not a remaining-seconds count: iOS freezes and
   *  Chrome throttles timers in the background, so only a deadline stays
   *  right across a locked phone. */
  endsAt: number;
  /** The rest this period started with — the progress bar's 100%. */
  totalSeconds: number;
  exerciseName: string;
  nextSet: string;
}

/** Longest rest the ±30s buttons will extend to. */
export const MAX_REST_SECONDS = 60 * 60;

export function startRest(
  seconds: number,
  exerciseName: string,
  nextSet: string,
  now = Date.now()
): TimerState {
  return { endsAt: now + seconds * 1000, totalSeconds: seconds, exerciseName, nextSet };
}

/** Whole seconds left, never negative — what the countdown shows. */
export function restRemaining(timer: TimerState, now = Date.now()): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/**
 * Moves the deadline by `deltaSeconds`, clamped to 0…MAX_REST_SECONDS, and
 * stretches `totalSeconds` when the new deadline is past it.
 *
 * Returns the same object when the clamp leaves the time unchanged. Re-anchoring
 * to `now` anyway pushed the deadline a fraction of a tick into the future, so
 * a "-30s" pressed at 0:00 flickered back to 0:01 and fired the rest alert a
 * second time — and a new object would also needlessly reschedule the push.
 */
export function adjustRest(timer: TimerState, deltaSeconds: number, now = Date.now()): TimerState {
  const left = restRemaining(timer, now);
  const next = Math.min(MAX_REST_SECONDS, Math.max(0, left + deltaSeconds));
  if (next === left) return timer;
  // The progress bar is remaining / totalSeconds. When "+30" takes the
  // remaining time past the rest's starting length, the bar's 100% grows
  // with it — otherwise it sat pinned full, not moving, until the extra time
  // had run down, and a "-30" after it seemed to do nothing.
  return { ...timer, endsAt: now + next * 1000, totalSeconds: Math.max(timer.totalSeconds, next) };
}

// Seed data now lives in src/lib/seedProgram.ts (the 5-day Push/Pull/Legs
// training program) and is applied by applyProgramSeed() in src/lib/db.ts.
// The old three-exercise "Push Day A" demo seed that lived here was replaced
// by it.

/**
 * What the log form offers for the set you are about to log.
 *
 * Sets after the first repeat the one you just did — mid-exercise, the set you
 * just finished is a better guess than anything from last week (same plates on
 * the bar, same fatigue). The first set has nothing to repeat, so it falls back
 * to last session's first set, then the template target. Weight is in kg.
 */
export function nextSetDefaults(ex: Exercise): { reps: number; weight: number } {
  const previous = ex.logged[ex.logged.length - 1];
  if (previous) return { reps: previous.reps, weight: previous.weight };
  const lastTime = ex.last?.[0];
  return { reps: lastTime?.r ?? ex.repsMin, weight: lastTime?.w ?? ex.targetWeight };
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export const fmtTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

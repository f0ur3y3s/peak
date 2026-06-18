# Phase 2a Design — IndexedDB Data Layer + Workout Persistence

**Date:** 2026-06-19
**Scope:** Replace in-memory seed data with IndexedDB persistence. Exercises load from DB; completed workouts are saved to DB with a post-workout summary; history reads from DB.

---

## Decisions

| Question | Decision |
|---|---|
| Schema approach | Flat embedded — two stores (`exercises`, `workout_sessions`) |
| Template/exercise CRUD | Out of scope (Phase 2b) |
| Finish workout UX | Post-workout summary screen before navigating to History |
| History source | `getWorkoutSessions()` replaces `SEED_HISTORY` |
| Analytics wiring | Stays on generated seed data until Phase 2d |

---

## Subsystem A — Data Layer (`src/lib/db.ts`)

### Dependency

```bash
npm install idb
```

### Database

Name: `peak-db`, version `1`.

### Object stores

**`exercises`**
- Key: `id` (string)
- Index: `muscle` (for future grouping)
- Schema: `{ id, name, muscle, targetSets, repsMin, repsMax, targetWeight, restSeconds }`
- Note: runtime fields (`last`, `logged`) are NOT stored here — `last` is derived from `workout_sessions` at read time; `logged` is ephemeral in-memory state during an active workout.
- Seeded once on DB creation (`upgrade` callback, version 1) from `SEED_EXERCISES`.

**`workout_sessions`**
- Key: `id` (string, `crypto.randomUUID()`)
- Index: `startedAt` (for newest-first queries)
- Schema:

```ts
interface WorkoutSession {
  id: string;
  templateName: string;
  startedAt: number;   // ms timestamp
  finishedAt: number;  // ms timestamp
  exercises: {
    name: string;
    sets: { reps: number; weight: number }[];
  }[];
}
```

### Public API (only these four functions exported)

```ts
getExercises(): Promise<Exercise[]>
saveWorkoutSession(session: WorkoutSession): Promise<void>
getWorkoutSessions(limit?: number): Promise<WorkoutSession[]>  // newest first
getPR(exerciseName: string): Promise<number>  // best weight ever, 0 if none
```

`getExercises()` reconstructs the full `Exercise` type expected by `ActiveWorkout`. The `last` field is derived by reading the most recent `workout_session` that contains that exercise and extracting its sets. The `logged` field is always `[]` (runtime only).

### Type location

`WorkoutSession` is defined and exported from `src/lib/db.ts`. The existing `Exercise` type stays in `src/lib/data.ts` — `db.ts` imports it.

---

## Subsystem B — Workout Persistence

### `ActiveWorkout.tsx` changes

1. **Load exercises from DB on mount**
   - Replace `useState(SEED_EXERCISES)` with `useState<Exercise[]>([])`
   - `useEffect` on mount: `getExercises().then(setExercises)`
   - Track `startedAt = useRef(Date.now())` on mount for duration calculation

2. **Finish button saves session**
   - Add `const [finished, setFinished] = useState(false)` and `const [session, setSession] = useState<WorkoutSession | null>(null)`
   - Finish `onClick`:
     1. Build `WorkoutSession` from current state
     2. Call `saveWorkoutSession(session)`
     3. Set `finished = true`, `session = builtSession`
   - When `finished` is true, render `<WorkoutSummary>` instead of the exercise list

3. **`handleLog` unchanged** — still updates in-memory `exercises` state

### `WorkoutSummary` component (`src/screens/WorkoutSummary.tsx`)

Rendered by `ActiveWorkout` when `finished === true`. Receives:

```ts
interface WorkoutSummaryProps {
  session: WorkoutSession;  // session.prs is the string[] of PR exercise names
  onDone: () => void;       // navigates to History
}
```

Displays:
- Duration: `finishedAt - startedAt` formatted as `m:ss`
- Total volume: sum of `reps × weight` across all sets, formatted as `X,XXX kg`
- Sets logged count
- Per-exercise PR badge (electric-lime) if `prs[name]` is true
- **Done** button → calls `onDone()`

`App.tsx` wires `onDone` to navigate to the History screen.

### PR detection

Before calling `setFinished`, for each exercise in the current session:
- Call `getPR(exerciseName)` to get the previous best weight
- If `Math.max(...sets.map(s => s.weight)) > previousBest` → mark as PR

---

## Subsystem B — History Reads

### `HistoryScreen.tsx` changes

- Remove `SEED_HISTORY` import
- `useEffect` on mount: `getWorkoutSessions().then(setSessions)`
- Map `WorkoutSession` to display:
  - `date`: `fmtRelativeDate(session.startedAt)` (new util, see below)
  - `duration`: `(session.finishedAt - session.startedAt) / 60000` formatted as `Xm`
  - `volume`: computed from sets
  - `sets`: total set count
  - `pr`: true if any exercise in the session was a PR (stored in session? or re-derived?)

### PR flag on `WorkoutSession`

Add an optional `prs: string[]` field to `WorkoutSession` — array of exercise names that set a PR in that session. Written at save time. Read at history display time to show the PR badge.

### `fmtRelativeDate(ts: number): string`

Added to `src/lib/utils.ts`:
- Today → `"Today"`
- Yesterday → `"Yesterday"`
- 2–6 days ago → `"N days ago"`
- 7+ days → `"DD MMM"` (e.g., `"12 Jun"`)

### Cleanup

- `SEED_HISTORY` deleted from `src/lib/data.ts`
- `SEED_EXERCISES` stays (used by `db.ts` for seed-on-first-launch)

---

## File Changeset

| File | Action |
|---|---|
| `package.json` | Add `idb` |
| `src/lib/db.ts` | Create — DB open, stores, public API |
| `src/lib/data.ts` | Remove `SEED_HISTORY`, remove runtime fields from `Exercise` type? (keep as-is, db derives them) |
| `src/lib/utils.ts` | Add `fmtRelativeDate()` |
| `src/screens/ActiveWorkout.tsx` | Load from DB, Finish saves session, render WorkoutSummary |
| `src/screens/WorkoutSummary.tsx` | Create — post-workout summary with PR badges + Done button |
| `src/screens/HistoryScreen.tsx` | Replace SEED_HISTORY with DB reads |
| `src/App.tsx` | Wire WorkoutSummary `onDone` → History screen |

---

## Out of Scope

- Template creation / editing (Phase 2b)
- Exercise library management (Phase 2b)
- Rest timer editing per exercise (Phase 2b)
- HistoryAnalytics wired to real data (Phase 2d)
- Supabase sync (Phase 3)

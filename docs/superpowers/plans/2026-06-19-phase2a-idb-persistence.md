# Phase 2a: IndexedDB Data Layer + Workout Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory seed data with IndexedDB persistence — exercises load from DB, completed workouts save to DB with a post-workout summary screen, and history reads from DB.

**Architecture:** A single `src/lib/db.ts` module wraps the `idb` library around one IndexedDB database (`peak-db`, two object stores: `exercises`, `workout_sessions`) and exposes four functions (`getExercises`, `saveWorkoutSession`, `getWorkoutSessions`, `getPR`). `ActiveWorkout` loads exercises from this module on mount and, on Finish, builds a `WorkoutSession`, computes PRs, saves it, and renders a new `WorkoutSummary` screen. `HistoryScreen` reads sessions from the same module instead of a static seed array.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 6, `idb` (IndexedDB wrapper), Tailwind, shadcn/ui components already in the repo.

## Global Constraints

- TypeScript strict mode: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` (from `tsconfig.app.json`) — every new file must satisfy these with zero errors.
- No test runner is configured in this repo (no vitest/jest). Verification steps use `npx tsc -b --noEmit` for type-correctness and manual browser smoke checks via `npm run dev` — do not invent a test framework as part of this plan.
- Path alias `@/*` maps to `./src/*` — use it for all intra-`src` imports (e.g. `@/lib/db`, `@/lib/data`).
- Only four functions are exported from `src/lib/db.ts`: `getExercises`, `saveWorkoutSession`, `getWorkoutSessions`, `getPR`. No other exports.
- `WorkoutSession` type is defined in `src/lib/db.ts`; `Exercise` type stays in `src/lib/data.ts` and is imported by `db.ts`.
- Design system: dark background `hsl(var(--background))`, electric-lime primary `hsl(var(--primary))`, `font-mono`/`'DM Mono', monospace` for numeric/label text — match existing component styling (see `ExerciseCard.tsx`, `HistoryScreen.tsx`) rather than inventing new patterns.
- Out of scope: template/exercise CRUD, rest timer editing, HistoryAnalytics wiring to real data, Supabase sync.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Add `idb` dependency |
| `src/lib/db.ts` | New — IndexedDB open/upgrade logic, `WorkoutSession` type, four public functions |
| `src/lib/data.ts` | Remove `SEED_HISTORY` and its now-unused `WorkoutRecord`/`HistoryExercise`/`HistorySet` types |
| `src/lib/utils.ts` | Add `fmtRelativeDate()` |
| `src/screens/ActiveWorkout.tsx` | Load exercises from DB, track start time, Finish button builds+saves session, computes PRs, renders `WorkoutSummary` |
| `src/screens/WorkoutSummary.tsx` | New — post-workout summary screen (duration, volume, sets, PR badges, Done button) |
| `src/screens/HistoryScreen.tsx` | Read sessions from DB instead of `SEED_HISTORY`, render using derived display fields |
| `src/App.tsx` | Wire `ActiveWorkout`'s finish/done flow to navigate to History |

---

## Task 1: Install `idb` and create the data layer

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/lib/db.ts`

**Interfaces:**
- Consumes: `Exercise`, `SEED_EXERCISES` from `@/lib/data` (existing, see `src/lib/data.ts:14-96`)
- Produces:
  ```ts
  export interface WorkoutSession {
    id: string;
    templateName: string;
    startedAt: number;
    finishedAt: number;
    exercises: { name: string; sets: { reps: number; weight: number }[] }[];
    prs: string[];
  }
  export function getExercises(): Promise<Exercise[]>;
  export function saveWorkoutSession(session: WorkoutSession): Promise<void>;
  export function getWorkoutSessions(limit?: number): Promise<WorkoutSession[]>; // newest first
  export function getPR(exerciseName: string): Promise<number>; // best weight ever, 0 if none
  ```
  These four functions and `WorkoutSession` are what `ActiveWorkout.tsx` and `HistoryScreen.tsx` import in later tasks.

- [ ] **Step 1: Install `idb`**

```bash
npm install idb
```

- [ ] **Step 2: Verify the install**

Run: `grep '"idb"' package.json`
Expected: a line like `"idb": "^8.x.x",` under `dependencies`.

- [ ] **Step 3: Write `src/lib/db.ts`**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SEED_EXERCISES, type Exercise } from "@/lib/data";

export interface WorkoutSession {
  id: string;
  templateName: string;
  startedAt: number;
  finishedAt: number;
  exercises: {
    name: string;
    sets: { reps: number; weight: number }[];
  }[];
  prs: string[];
}

interface ExerciseRecord {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

interface PeakDB extends DBSchema {
  exercises: {
    key: string;
    value: ExerciseRecord;
    indexes: { muscle: string };
  };
  workout_sessions: {
    key: string;
    value: WorkoutSession;
    indexes: { startedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<PeakDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PeakDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PeakDB>("peak-db", 1, {
      upgrade(db) {
        const exerciseStore = db.createObjectStore("exercises", { keyPath: "id" });
        exerciseStore.createIndex("muscle", "muscle");

        const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
        sessionStore.createIndex("startedAt", "startedAt");

        for (const ex of SEED_EXERCISES) {
          exerciseStore.put({
            id: ex.id,
            name: ex.name,
            muscle: ex.muscle,
            targetSets: ex.targetSets,
            repsMin: ex.repsMin,
            repsMax: ex.repsMax,
            targetWeight: ex.targetWeight,
            restSeconds: ex.restSeconds,
          });
        }
      },
    });
  }
  return dbPromise;
}

async function lastSetsFor(exerciseName: string): Promise<{ r: number; w: number }[] | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  for (let i = sessions.length - 1; i >= 0; i--) {
    const match = sessions[i].exercises.find((e) => e.name === exerciseName);
    if (match) {
      return match.sets.map((s) => ({ r: s.reps, w: s.weight }));
    }
  }
  return null;
}

export async function getExercises(): Promise<Exercise[]> {
  const db = await getDB();
  const records = await db.getAll("exercises");
  const result: Exercise[] = [];
  for (const rec of records) {
    result.push({
      ...rec,
      last: await lastSetsFor(rec.name),
      logged: [],
    });
  }
  return result;
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  const db = await getDB();
  await db.put("workout_sessions", session);
}

export async function getWorkoutSessions(limit?: number): Promise<WorkoutSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  sessions.reverse();
  return limit ? sessions.slice(0, limit) : sessions;
}

export async function getPR(exerciseName: string): Promise<number> {
  const db = await getDB();
  const sessions = await db.getAll("workout_sessions");
  let best = 0;
  for (const session of sessions) {
    const match = session.exercises.find((e) => e.name === exerciseName);
    if (match) {
      for (const set of match.sets) {
        if (set.weight > best) best = set.weight;
      }
    }
  }
  return best;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors referencing `src/lib/db.ts`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/db.ts
git commit -m "feat: add IndexedDB data layer for exercises and workout sessions"
```

---

## Task 2: Add `fmtRelativeDate` util

**Files:**
- Modify: `src/lib/utils.ts`

**Interfaces:**
- Produces: `export function fmtRelativeDate(ts: number): string` — used by `HistoryScreen.tsx` in Task 4.

- [ ] **Step 1: Add the function**

```ts
export function fmtRelativeDate(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff} days ago`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${then.getDate()} ${months[then.getMonth()]}`;
}
```

Full file after this change:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtRelativeDate(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff} days ago`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${then.getDate()} ${months[then.getMonth()]}`;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual sanity check**

Run: `node -e "
const fn = ts => { const now=new Date(); const then=new Date(ts); const s=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); const diff=Math.round((s(now)-s(then))/86400000); if(diff===0) return 'Today'; if(diff===1) return 'Yesterday'; if(diff>=2&&diff<=6) return diff+' days ago'; const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return then.getDate()+' '+m[then.getMonth()]; };
console.log(fn(Date.now()));
console.log(fn(Date.now()-86400000));
console.log(fn(Date.now()-4*86400000));
console.log(fn(Date.now()-20*86400000));
"`
Expected output: `Today`, `Yesterday`, `4 days ago`, then a `DD MMM` date roughly 20 days back.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add fmtRelativeDate util for history display"
```

---

## Task 3: Post-workout summary screen and `ActiveWorkout` persistence wiring

**Files:**
- Create: `src/screens/WorkoutSummary.tsx`
- Modify: `src/screens/ActiveWorkout.tsx`

**Interfaces:**
- Consumes: `WorkoutSession`, `getExercises`, `saveWorkoutSession`, `getPR` from `@/lib/db` (Task 1); `Exercise`, `fmtTime`, `TimerState` from `@/lib/data`.
- Produces:
  ```ts
  interface WorkoutSummaryProps {
    session: WorkoutSession;
    onDone: () => void;
  }
  export function WorkoutSummary(props: WorkoutSummaryProps): JSX.Element;
  ```
  `ActiveWorkout` gains a new prop consumed by `App.tsx` in Task 5: `onFinish: () => void` (called when the user clicks Done on the summary, i.e. ready to navigate to History).

- [ ] **Step 1: Write `src/screens/WorkoutSummary.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type WorkoutSession } from "@/lib/db";
import { fmtTime } from "@/lib/data";

interface WorkoutSummaryProps {
  session: WorkoutSession;
  onDone: () => void;
}

export function WorkoutSummary({ session, onDone }: WorkoutSummaryProps) {
  const durationSeconds = Math.round((session.finishedAt - session.startedAt) / 1000);
  const totalVolume = session.exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
    0
  );
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

  return (
    <div className="px-5 pt-10 pb-10 flex flex-col gap-6">
      <div className="text-center">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest mb-2">
          Workout Complete
        </p>
        <p className="font-semibold text-2xl">{session.templateName}</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {fmtTime(durationSeconds)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {totalVolume.toLocaleString()}kg
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Volume</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {totalSets}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Sets</p>
          </CardContent>
        </Card>
      </div>

      {session.prs.length > 0 && (
        <div>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest mb-2.5">
            Personal Records
          </p>
          <div className="flex flex-col gap-2">
            {session.prs.map((name) => (
              <Card key={name}>
                <CardContent
                  style={{ padding: "10px 14px" }}
                  className="flex justify-between items-center"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <Badge
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      background: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                      letterSpacing: "0.08em",
                    }}
                  >
                    PR
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full font-semibold text-[15px] tracking-tight" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/screens/ActiveWorkout.tsx`**

```tsx
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/TopBar";
import { ExerciseCard } from "@/components/ExerciseCard";
import { TimerSheet } from "@/components/TimerSheet";
import { WorkoutSummary } from "@/screens/WorkoutSummary";
import { fmtTime, type Exercise, type TimerState } from "@/lib/data";
import { getExercises, saveWorkoutSession, getPR, type WorkoutSession } from "@/lib/db";

interface ActiveWorkoutProps {
  onBack: () => void;
  onFinish: () => void;
}

export function ActiveWorkout({ onBack, onFinish }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getExercises().then((exs) => {
      setExercises(exs);
      if (exs.length > 0) setActiveId(exs[0].id);
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const handleLog = (exId: string, reps: number, weight: number) => {
    let restSeconds = 120;
    let exerciseName = "";
    let nextSet = "";

    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        const newLogged = [...ex.logged, { id: `s${Date.now()}`, reps, weight }];
        restSeconds = ex.restSeconds;
        exerciseName = ex.name;
        const setsLeft = ex.targetSets - newLogged.length;
        nextSet =
          setsLeft > 0
            ? `Set ${newLogged.length + 1} of ${ex.targetSets}`
            : "Last set done";
        return { ...ex, logged: newLogged };
      })
    );

    setTimer({ seconds: restSeconds, exerciseName, nextSet });
  };

  const handleFinish = async () => {
    const loggedExercises = exercises.filter((ex) => ex.logged.length > 0);

    const prs: string[] = [];
    for (const ex of loggedExercises) {
      const previousBest = await getPR(ex.name);
      const bestThisSession = Math.max(...ex.logged.map((s) => s.weight));
      if (bestThisSession > previousBest) prs.push(ex.name);
    }

    const built: WorkoutSession = {
      id: crypto.randomUUID(),
      templateName: "Push Day A",
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      exercises: loggedExercises.map((ex) => ({
        name: ex.name,
        sets: ex.logged.map((s) => ({ reps: s.reps, weight: s.weight })),
      })),
      prs,
    };

    await saveWorkoutSession(built);
    setSession(built);
  };

  if (session) {
    return <WorkoutSummary session={session} onDone={onFinish} />;
  }

  const totalLogged = exercises.reduce((a, e) => a + e.logged.length, 0);
  const totalTarget = exercises.reduce((a, e) => a + e.targetSets, 0);

  return (
    <>
      {timer && <TimerSheet timer={timer} onClose={() => setTimer(null)} />}

      <div>
        <TopBar
          title="Push Day A"
          sub={`${fmtTime(elapsed)} · ${totalLogged}/${totalTarget} sets`}
          onBack={onBack}
          right={
            <Button
              variant="outline"
              className="text-[13px] text-muted-foreground"
              onClick={handleFinish}
            >
              Finish
            </Button>
          }
        />

        {/* Global progress bar */}
        <div className="px-5 pt-2.5">
          <Progress value={totalTarget > 0 ? (totalLogged / totalTarget) * 100 : 0} className="h-[3px]" />
        </div>

        <div className="px-5 pt-3.5 pb-28 flex flex-col gap-3">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              isActive={activeId === ex.id}
              onActivate={setActiveId}
              onLogSet={handleLog}
            />
          ))}

          <Button
            variant="outline"
            className="text-muted-foreground rounded-xl h-auto py-4"
            style={{ border: "1px dashed hsl(var(--border))" }}
          >
            + Add exercise
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `ActiveWorkout.tsx` or `WorkoutSummary.tsx`. (App.tsx will still error until Task 5 — that's expected at this point.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/ActiveWorkout.tsx src/screens/WorkoutSummary.tsx
git commit -m "feat: persist workout sessions to IndexedDB and show post-workout summary"
```

---

## Task 4: Wire `HistoryScreen` to read from IndexedDB

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/lib/data.ts` (remove `SEED_HISTORY`, `WorkoutRecord`, `HistoryExercise`, `HistorySet` — no longer referenced anywhere after this task)

**Interfaces:**
- Consumes: `getWorkoutSessions`, `WorkoutSession` from `@/lib/db` (Task 1); `fmtRelativeDate` from `@/lib/utils` (Task 2).

- [ ] **Step 1: Remove unused types/seed from `src/lib/data.ts`**

Delete lines 27-46 (`HistorySet`, `HistoryExercise`, `WorkoutRecord` interfaces) and lines 98-141 (`SEED_HISTORY` constant) from `src/lib/data.ts`. The file should read:

```ts
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
```

- [ ] **Step 2: Rewrite `src/screens/HistoryScreen.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { HistoryAnalytics } from "@/components/HistoryAnalytics";
import { getWorkoutSessions, type WorkoutSession } from "@/lib/db";
import { fmtRelativeDate } from "@/lib/utils";

interface HistoryScreenProps {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    getWorkoutSessions().then(setSessions);
  }, []);

  return (
    <div>
      <TopBar title="History" onBack={onBack} />

      <div className="px-5 pt-4 pb-24 flex flex-col gap-4">

        {/* ── Analytics panel ── */}
        <HistoryAnalytics />

        {/* ── Divider ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: "hsl(var(--muted-foreground))",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Workouts
          </span>
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
        </div>

        {/* ── Workout list ── */}
        {sessions.map((session) => {
          const durationMin = Math.round((session.finishedAt - session.startedAt) / 60000);
          const volume = session.exercises.reduce(
            (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
            0
          );
          const setCount = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
          const hasPR = session.prs.length > 0;

          return (
            <Card
              key={session.id}
              onClick={() => setExpanded((e) => (e === session.id ? null : session.id))}
              className="cursor-pointer transition-colors"
              style={{
                borderColor: expanded === session.id ? "hsl(var(--primary) / 0.4)" : undefined,
              }}
            >
              <CardContent style={{ padding: "14px 16px" }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex gap-2 items-center mb-1">
                      <p className="font-semibold text-[15px]">{session.templateName}</p>
                      {hasPR && (
                        <Badge
                          style={{
                            fontSize: 9,
                            padding: "1px 6px",
                            background: "hsl(var(--primary) / 0.15)",
                            color: "hsl(var(--primary))",
                            letterSpacing: "0.08em",
                          }}
                        >
                          PR
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {fmtRelativeDate(session.startedAt)} · {durationMin}m
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-sm">{volume.toLocaleString()} kg</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {setCount} sets
                      </p>
                    </div>
                    <span className={`history-chevron${expanded === session.id ? " open" : ""}`}>
                      ▼
                    </span>
                  </div>
                </div>

                {expanded === session.id && (
                  <div className="mt-3.5 pt-3.5 border-t border-border">
                    {session.exercises.map((ex) => (
                      <div key={ex.name} className="mb-3">
                        <p className="font-medium text-[13px] mb-1.5">{ex.name}</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {ex.sets.map((s, i) => (
                            <span
                              key={i}
                              className="font-mono text-xs px-2 py-0.5 rounded-md border border-border"
                              style={{ background: "hsl(var(--secondary))" }}
                            >
                              {s.reps} × {s.weight}kg
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `HistoryScreen.tsx` or `data.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data.ts src/screens/HistoryScreen.tsx
git commit -m "feat: read workout history from IndexedDB instead of seed data"
```

---

## Task 5: Wire `App.tsx` finish flow and full build verification

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ActiveWorkout`'s new `onFinish: () => void` prop (Task 3).

- [ ] **Step 1: Update `ActiveWorkout` usage in `src/App.tsx`**

Replace:

```tsx
        {screen === "workout" && (
          <ActiveWorkout
            onBack={() => setScreen("template")}
          />
        )}
```

with:

```tsx
        {screen === "workout" && (
          <ActiveWorkout
            onBack={() => setScreen("template")}
            onFinish={() => {
              setScreen("history");
              setNav("history");
            }}
          />
        )}
```

- [ ] **Step 2: Full project type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the browser:
1. Navigate to the workout screen, log at least one set on an exercise, click **Finish**.
2. Confirm the `WorkoutSummary` screen renders with duration, volume, and set count.
3. Click **Done** — confirm it navigates to the History screen and the just-finished workout appears at the top of the list with the correct relative date ("Today"), duration, volume, and set count.
4. Expand the new history entry — confirm per-exercise sets display correctly.
5. Repeat logging a heavier weight on the same exercise in a new workout — confirm the summary shows a PR badge for that exercise, and confirm it shows in the History list too.
6. Refresh the page — confirm the history entries persist (IndexedDB survived reload) and exercises still load into a new workout with `last` populated from the most recent session.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: navigate to history after workout finish flow"
```

---

## Self-Review Notes

- Spec coverage: Subsystem A (data layer), Subsystem B (workout persistence + history reads), PR detection, `fmtRelativeDate`, cleanup of `SEED_HISTORY` are all covered across Tasks 1-5.
- `WorkoutSummaryProps` uses `session: WorkoutSession` directly (matching the spec's corrected version, not the original `prs: Record<string, boolean>` draft).
- Type names are consistent across tasks: `WorkoutSession`, `getExercises`, `saveWorkoutSession`, `getWorkoutSessions`, `getPR` are spelled identically everywhere they're consumed.
- `ActiveWorkout`'s hardcoded `templateName: "Push Day A"` matches the existing hardcoded title already in the component (`TopBar title="Push Day A"`) — no new template selection logic is introduced, consistent with Phase 2b being out of scope.

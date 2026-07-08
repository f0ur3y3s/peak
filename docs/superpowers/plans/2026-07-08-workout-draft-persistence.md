# Active Workout Draft Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-progress workout state (logged sets, start time) survive navigation and page reloads by persisting a draft to IndexedDB, with a way to resume it from anywhere in the app, an explicit way to discard it, and a guard against starting a second concurrent workout.

**Architecture:** A new singleton IndexedDB store (`active_workout_draft`, always at most one record keyed `"current"`) holds the in-progress workout's shape. `ActiveWorkout` hydrates from it on mount and writes to it after every logged set; `App.tsx`'s navigation resolution checks it before falling back to today's "most recently used template" logic; `TemplateDetail`'s Start button checks it to block a conflicting concurrent workout.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 6, `idb` (already installed).

## Global Constraints

- TypeScript strict mode: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` (from `tsconfig.app.json`) — every changed file must satisfy these with zero errors.
- No test runner is configured in this repo (no vitest/jest). Verification is `npx tsc -b --noEmit` plus manual browser smoke checks via `npm run dev`.
- Path alias `@/*` maps to `./src/*`.
- Design system: dark background `hsl(var(--background))`, electric-lime primary `hsl(var(--primary))`, `font-mono`/`'DM Mono', monospace` for numeric/label text, `hsl(var(--destructive))` for error/destructive text — match existing patterns in `ActiveWorkout.tsx`/`TemplateDetail.tsx` rather than inventing new ones.
- Only one workout draft can exist at a time — starting a second workout while one is in progress on a different template must be blocked with a message naming the in-progress template, never silently replaced.
- The draft store is entirely separate from `workout_sessions` (which only ever holds finished sessions) — nothing that reads history/PRs/last-performed should need to change because of this feature.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db.ts` | Modify — v2→v3 schema (`active_workout_draft` store), `getActiveWorkoutDraft`/`saveActiveWorkoutDraft`/`clearActiveWorkoutDraft`, `deleteTemplate` clears a matching draft |
| `src/screens/ActiveWorkout.tsx` | Modify — resume-on-mount hydration, elapsed-as-derived-value fix, persist-on-log, clear-on-finish, new Discard action |
| `src/screens/TemplateDetail.tsx` | Modify — Start button checks for a conflicting draft before proceeding |
| `src/App.tsx` | Modify — initial load and Workout-tab navigation check the draft before falling back to last-used-template resolution; wire `onDiscard` |

---

## Task 1: Data layer — draft store + CRUD + delete-template edge case

**Files:**
- Modify: `src/lib/db.ts` (full rewrite)

**Interfaces:**
- Consumes: nothing new — same imports as before.
- Produces (new exports later tasks rely on — exact names/types):
  ```ts
  export interface ActiveWorkoutDraft {
    id: "current";
    templateId: string;
    templateName: string;
    startedAt: number;
    exercises: { exerciseId: string; logged: { id: string; reps: number; weight: number }[] }[];
  }
  export function getActiveWorkoutDraft(): Promise<ActiveWorkoutDraft | undefined>;
  export function saveActiveWorkoutDraft(draft: ActiveWorkoutDraft): Promise<void>;
  export function clearActiveWorkoutDraft(): Promise<void>;
  ```
  All other existing exports (`WorkoutSession`, `LibraryExercise`, `TemplateExerciseConfig`, `Template`, `getTemplates`, `getTemplate`, `saveTemplate`, `getExerciseLibrary`, `saveLibraryExercise`, `deleteLibraryExercise`, `getExercises`, `getLastUsedTemplateId`, `saveWorkoutSession`, `getWorkoutSessions`, `sessionVolume`, `sessionSetCount`, `getPR`) keep their exact current signatures. `deleteTemplate(id: string): Promise<void>` keeps its signature but gains new internal behavior (see Step 1).

- [ ] **Step 1: Replace `src/lib/db.ts` in full**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SEED_EXERCISES, type Exercise } from "@/lib/data";

export interface WorkoutSession {
  id: string;
  templateId?: string;
  templateName: string;
  startedAt: number;
  finishedAt: number;
  exercises: {
    name: string;
    sets: { reps: number; weight: number }[];
  }[];
  prs: string[];
}

export interface LibraryExercise {
  id: string;
  name: string;
  muscle: string;
}

export interface TemplateExerciseConfig {
  exerciseId: string;
  order: number;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

export interface Template {
  id: string;
  name: string;
  exercises: TemplateExerciseConfig[];
}

export interface ActiveWorkoutDraft {
  id: "current";
  templateId: string;
  templateName: string;
  startedAt: number;
  exercises: {
    exerciseId: string;
    logged: { id: string; reps: number; weight: number }[];
  }[];
}

interface ExerciseRecordV1 {
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
  exercise_library: {
    key: string;
    value: LibraryExercise;
  };
  templates: {
    key: string;
    value: Template;
  };
  workout_sessions: {
    key: string;
    value: WorkoutSession;
    indexes: { startedAt: number };
  };
  active_workout_draft: {
    key: string;
    value: ActiveWorkoutDraft;
  };
}

let dbPromise: Promise<IDBPDatabase<PeakDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PeakDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PeakDB>("peak-db", 3, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
          sessionStore.createIndex("startedAt", "startedAt");
        }

        if (oldVersion < 2) {
          const libraryStore = db.createObjectStore("exercise_library", { keyPath: "id" });
          const templateStore = db.createObjectStore("templates", { keyPath: "id" });

          if (oldVersion === 1) {
            // "exercises" is no longer part of the typed v2+ schema (removed below),
            // so we reach it through the raw transaction for this one-time migration.
            //
            // Note: `transaction` here is idb's own Proxy-wrapped IDBTransaction (idb
            // wraps it before handing it to `upgrade()`), so the cast below doesn't
            // change the runtime object. That means `.objectStore(...).getAll()` is
            // *also* proxied by idb and already returns a Promise (idb auto-promisifies
            // any IDBRequest an intercepted method returns) rather than a raw
            // IDBRequest — so we await it directly instead of re-wrapping it in our own
            // onsuccess/onerror-based promisifier, which would never fire against an
            // already-resolved-via-Promise value and would silently hang the upgrade
            // (dropping all exercise/template data while the DB version still advances).
            const rawTx = transaction as unknown as IDBTransaction;
            const oldStore = rawTx.objectStore("exercises");
            const oldRecords = (await oldStore.getAll()) as unknown as ExerciseRecordV1[];

            for (const rec of oldRecords) {
              libraryStore.put({ id: rec.id, name: rec.name, muscle: rec.muscle });
            }

            templateStore.put({
              id: crypto.randomUUID(),
              name: "Push Day A",
              exercises: oldRecords.map((rec, i) => ({
                exerciseId: rec.id,
                order: i,
                targetSets: rec.targetSets,
                repsMin: rec.repsMin,
                repsMax: rec.repsMax,
                targetWeight: rec.targetWeight,
                restSeconds: rec.restSeconds,
              })),
            });

            // Same reasoning as `rawTx` above — "exercises" is no longer a
            // known store name in the typed v2+ schema.
            (db as unknown as IDBDatabase).deleteObjectStore("exercises");
          } else {
            for (const ex of SEED_EXERCISES) {
              libraryStore.put({ id: ex.id, name: ex.name, muscle: ex.muscle });
            }
            templateStore.put({
              id: crypto.randomUUID(),
              name: "Push Day A",
              exercises: SEED_EXERCISES.map((ex, i) => ({
                exerciseId: ex.id,
                order: i,
                targetSets: ex.targetSets,
                repsMin: ex.repsMin,
                repsMax: ex.repsMax,
                targetWeight: ex.targetWeight,
                restSeconds: ex.restSeconds,
              })),
            });
          }
        }

        if (oldVersion < 3) {
          db.createObjectStore("active_workout_draft", { keyPath: "id" });
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
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

export async function getTemplates(): Promise<Template[]> {
  const db = await getDB();
  return db.getAll("templates");
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const db = await getDB();
  return db.get("templates", id);
}

export async function saveTemplate(template: Template): Promise<void> {
  const db = await getDB();
  await db.put("templates", template);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("templates", id);
  const draft = await db.get("active_workout_draft", "current");
  if (draft && draft.templateId === id) {
    await db.delete("active_workout_draft", "current");
  }
}

export async function getExerciseLibrary(): Promise<LibraryExercise[]> {
  const db = await getDB();
  return db.getAll("exercise_library");
}

export async function saveLibraryExercise(exercise: LibraryExercise): Promise<void> {
  const db = await getDB();
  await db.put("exercise_library", exercise);
}

export async function deleteLibraryExercise(
  id: string
): Promise<{ ok: true } | { ok: false; usedIn: string[] }> {
  const db = await getDB();
  const templates = await db.getAll("templates");
  const usedIn = templates
    .filter((t) => t.exercises.some((e) => e.exerciseId === id))
    .map((t) => t.name);
  if (usedIn.length > 0) {
    return { ok: false, usedIn };
  }
  await db.delete("exercise_library", id);
  return { ok: true };
}

export async function getExercises(templateId: string): Promise<Exercise[]> {
  const db = await getDB();
  const template = await db.get("templates", templateId);
  if (!template) return [];
  const library = await db.getAll("exercise_library");
  const libraryById = new Map(library.map((l) => [l.id, l]));

  const result: Exercise[] = [];
  const sorted = [...template.exercises].sort((a, b) => a.order - b.order);
  for (const cfg of sorted) {
    const lib = libraryById.get(cfg.exerciseId);
    if (!lib) continue;
    result.push({
      id: cfg.exerciseId,
      name: lib.name,
      muscle: lib.muscle,
      targetSets: cfg.targetSets,
      repsMin: cfg.repsMin,
      repsMax: cfg.repsMax,
      targetWeight: cfg.targetWeight,
      restSeconds: cfg.restSeconds,
      last: await lastSetsFor(lib.name),
      logged: [],
    });
  }
  return result;
}

export async function getLastUsedTemplateId(): Promise<string | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  const templates = await db.getAll("templates");
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    if (session.templateId) {
      const match = templates.find((t) => t.id === session.templateId);
      if (match) return match.id;
      continue;
    }
    const match = templates.find((t) => t.name === session.templateName);
    if (match) return match.id;
  }
  if (templates.length === 0) return null;
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0].id;
}

export async function getActiveWorkoutDraft(): Promise<ActiveWorkoutDraft | undefined> {
  const db = await getDB();
  return db.get("active_workout_draft", "current");
}

export async function saveActiveWorkoutDraft(draft: ActiveWorkoutDraft): Promise<void> {
  const db = await getDB();
  await db.put("active_workout_draft", draft);
}

export async function clearActiveWorkoutDraft(): Promise<void> {
  const db = await getDB();
  await db.delete("active_workout_draft", "current");
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

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
    0
  );
}

export function sessionSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
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

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual verification with the dev server**

Run: `npm run dev`, open the app in a browser, open the browser DevTools console, and run:

```js
const db = await import("/src/lib/db.ts");
console.log(await db.getActiveWorkoutDraft());          // expect: undefined
await db.saveActiveWorkoutDraft({
  id: "current", templateId: "test-id", templateName: "Test",
  startedAt: Date.now(), exercises: [],
});
console.log(await db.getActiveWorkoutDraft());          // expect: the record just saved
await db.clearActiveWorkoutDraft();
console.log(await db.getActiveWorkoutDraft());          // expect: undefined again
```

Confirm the DB version bumped to 3 (`indexedDB.databases()` should show `{ name: "peak-db", version: 3 }`) and that `getTemplates()`/`getWorkoutSessions()` still return whatever this browser profile already had (the v2→v3 upgrade doesn't touch existing stores' data).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add active workout draft store for in-progress workout persistence"
```

---

## Task 2: `ActiveWorkout.tsx` — resume, persist, discard

**Files:**
- Modify: `src/screens/ActiveWorkout.tsx`

**Interfaces:**
- Consumes: `getActiveWorkoutDraft`, `saveActiveWorkoutDraft`, `clearActiveWorkoutDraft`, `type ActiveWorkoutDraft` from `@/lib/db` (Task 1).
- Produces (prop change `App.tsx` relies on in Task 4):
  ```ts
  interface ActiveWorkoutProps {
    templateId: string;
    onBack: () => void;
    onFinish: () => void;
    onDiscard: () => void;
  }
  ```

- [ ] **Step 1: Replace `src/screens/ActiveWorkout.tsx` in full**

```tsx
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/TopBar";
import { ExerciseCard } from "@/components/ExerciseCard";
import { TimerSheet } from "@/components/TimerSheet";
import { WorkoutSummary } from "@/screens/WorkoutSummary";
import { fmtTime, type Exercise, type TimerState } from "@/lib/data";
import {
  getExercises,
  getTemplate,
  saveWorkoutSession,
  getPR,
  getActiveWorkoutDraft,
  saveActiveWorkoutDraft,
  clearActiveWorkoutDraft,
  type WorkoutSession,
} from "@/lib/db";

interface ActiveWorkoutProps {
  templateId: string;
  onBack: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

export function ActiveWorkout({ templateId, onBack, onFinish, onDiscard }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getActiveWorkoutDraft().then((draft) => {
      const resumeDraft = draft && draft.templateId === templateId ? draft : undefined;
      if (resumeDraft) startedAt.current = resumeDraft.startedAt;

      getExercises(templateId)
        .then((exs) => {
          let hydrated = exs;
          if (resumeDraft) {
            const loggedByExerciseId = new Map(
              resumeDraft.exercises.map((e) => [e.exerciseId, e.logged])
            );
            hydrated = exs.map((ex) => ({
              ...ex,
              logged: loggedByExerciseId.get(ex.id) ?? ex.logged,
            }));
          }
          setExercises(hydrated);
          if (hydrated.length > 0) setActiveId(hydrated[0].id);
        })
        .catch(() => setLoadError("Couldn't load exercises — try reloading."));
    });
    getTemplate(templateId).then((t) => setTemplateName(t?.name ?? "Workout"));
  }, [templateId]);

  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleLog = (exId: string, reps: number, weight: number) => {
    let restSeconds = 120;
    let exerciseName = "";
    let nextSet = "";
    let updatedExercises: Exercise[] = [];

    setExercises((prev) => {
      updatedExercises = prev.map((ex) => {
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
      });
      return updatedExercises;
    });

    setTimer({ seconds: restSeconds, exerciseName, nextSet });
    setDraftError(null);

    saveActiveWorkoutDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged })),
    }).catch(() => setDraftError("Couldn't save progress — check your connection."));
  };

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setFinishError(null);
    try {
      const loggedExercises = exercises.filter((ex) => ex.logged.length > 0);

      const prs: string[] = [];
      for (const ex of loggedExercises) {
        const previousBest = await getPR(ex.name);
        const bestThisSession = Math.max(...ex.logged.map((s) => s.weight));
        if (bestThisSession > previousBest) prs.push(ex.name);
      }

      const built: WorkoutSession = {
        id: crypto.randomUUID(),
        templateId,
        templateName: templateName || "Workout",
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        exercises: loggedExercises.map((ex) => ({
          name: ex.name,
          sets: ex.logged.map((s) => ({ reps: s.reps, weight: s.weight })),
        })),
        prs,
      };

      await saveWorkoutSession(built);
      await clearActiveWorkoutDraft().catch(() => {});
      setSession(built);
    } catch {
      setFinishError("Couldn't save workout — try again.");
    } finally {
      setIsFinishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm("Discard this workout? Your logged sets will be lost.")) return;
    try {
      await clearActiveWorkoutDraft();
    } catch {
      // best-effort — still navigate away regardless of whether the clear succeeded
    }
    onDiscard();
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
          title={templateName || "Workout"}
          sub={`${fmtTime(elapsed)} · ${totalLogged}/${totalTarget} sets`}
          onBack={onBack}
          right={
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={handleDiscard}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  padding: "4px 8px",
                }}
              >
                discard
              </button>
              <Button
                variant="outline"
                className="text-[13px] text-muted-foreground"
                onClick={handleFinish}
                disabled={isFinishing}
              >
                {isFinishing ? "Finishing…" : "Finish"}
              </Button>
            </div>
          }
        />

        {loadError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {loadError}
          </p>
        )}

        {finishError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {finishError}
          </p>
        )}

        {draftError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {draftError}
          </p>
        )}

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

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: errors will appear in `src/App.tsx` (still passing the old 3-prop `ActiveWorkout` usage without `onDiscard`) — this is expected at this point in the plan (Task 4 fixes `App.tsx`; do not fix it now). Confirm the only errors are in `src/App.tsx` referencing `ActiveWorkout`'s props, and that `ActiveWorkout.tsx` itself has zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/ActiveWorkout.tsx
git commit -m "feat: resume/persist/discard active workout draft in ActiveWorkout"
```

---

## Task 3: `TemplateDetail.tsx` — block a conflicting concurrent workout

**Files:**
- Modify: `src/screens/TemplateDetail.tsx`

**Interfaces:**
- Consumes: `getActiveWorkoutDraft` from `@/lib/db` (Task 1).
- No prop changes — `TemplateDetailProps` stays exactly as it is today.

- [ ] **Step 1: Add the import**

Find:
```tsx
import {
  getTemplate,
  getExercises,
  getWorkoutSessions,
  saveTemplate,
  deleteTemplate,
  type Template,
  type LibraryExercise,
} from "@/lib/db";
```

Replace with:
```tsx
import {
  getTemplate,
  getExercises,
  getWorkoutSessions,
  saveTemplate,
  deleteTemplate,
  getActiveWorkoutDraft,
  type Template,
  type LibraryExercise,
} from "@/lib/db";
```

- [ ] **Step 2: Add the Start-guard handler**

Find (right after `handleDeleteTemplate`'s closing brace, before `const editingExistingConfig`):
```tsx
  const editingExistingConfig: ExerciseConfigValues | undefined = editingExisting
```

Insert immediately before it:
```tsx
  const handleStartClick = async () => {
    setActionError(null);
    const draft = await getActiveWorkoutDraft();
    if (draft && draft.templateId !== templateId) {
      setActionError(`Finish or discard your ${draft.templateName} workout first.`);
      return;
    }
    onStart();
  };

```

- [ ] **Step 3: Wire the Start button to the new handler**

Find:
```tsx
            {!editMode && (
              <Button
                onClick={onStart}
                disabled={exercises.length === 0}
                className="font-semibold tracking-tight"
              >
                Start
              </Button>
            )}
```

Replace with:
```tsx
            {!editMode && (
              <Button
                onClick={handleStartClick}
                disabled={exercises.length === 0}
                className="font-semibold tracking-tight"
              >
                Start
              </Button>
            )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: same pre-existing `src/App.tsx` error as after Task 2 (not yet fixed — Task 4 handles it), and no NEW errors from this file.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TemplateDetail.tsx
git commit -m "feat: block starting a workout while a different template's workout is in progress"
```

---

## Task 4: Wire `App.tsx`, full smoke test

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getActiveWorkoutDraft` from `@/lib/db` (Task 1); `ActiveWorkout`'s new `onDiscard: () => void` prop (Task 2).

- [ ] **Step 1: Replace `src/App.tsx` in full**

```tsx
import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { TemplatesScreen } from "@/screens/TemplatesScreen";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";
import { getLastUsedTemplateId, getActiveWorkoutDraft } from "@/lib/db";

type AppScreen = "templates" | "template" | "workout" | "history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<AppScreen>("templates");
  const [nav, setNav] = useState<Screen>("workout");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    getActiveWorkoutDraft().then((draft) => {
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        return;
      }
      getLastUsedTemplateId().then((id) => {
        if (id) {
          setActiveTemplateId(id);
          setScreen("template");
        } else {
          setScreen("templates");
        }
      });
    });
  }, [session]);

  if (session === undefined) return null;
  if (session === null) return <AuthScreen />;

  const handleNav = async (tab: Screen) => {
    setNav(tab);
    if (tab === "history") {
      setScreen("history");
    } else if (tab === "templates") {
      setScreen("templates");
    } else {
      const draft = await getActiveWorkoutDraft();
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        return;
      }
      const id = await getLastUsedTemplateId();
      if (id) {
        setActiveTemplateId(id);
        setScreen("template");
      } else {
        setScreen("templates");
      }
    }
  };

  return (
    <div
      className="bg-background min-h-screen relative"
      style={{ maxWidth: 430, margin: "0 auto" }}
    >
      <div className="scroll-area" style={{ paddingBottom: 60 }}>
        {screen === "templates" && (
          <TemplatesScreen
            onSelectTemplate={(id) => {
              setActiveTemplateId(id);
              setScreen("template");
            }}
            onCreateTemplate={(id) => {
              setActiveTemplateId(id);
              setScreen("template");
            }}
          />
        )}
        {screen === "template" && activeTemplateId && (
          <TemplateDetail
            templateId={activeTemplateId}
            onStart={() => setScreen("workout")}
            onBack={() => handleNav("templates")}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
        {screen === "workout" && activeTemplateId && (
          <ActiveWorkout
            templateId={activeTemplateId}
            onBack={() => setScreen("template")}
            onFinish={() => {
              setScreen("history");
              setNav("history");
            }}
            onDiscard={() => setScreen("template")}
          />
        )}
        {screen === "history" && (
          <HistoryScreen onBack={() => handleNav("workout")} />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the browser (sign in with the test account first):
1. Start a workout on any template. Log one set on the first exercise.
2. Tap the **Templates** nav tab (navigating away mid-workout without hitting Back or Finish). Confirm you land on the Templates list as normal — no crash.
3. Tap the **Workout** nav tab. Confirm you're taken directly back into the **same in-progress workout**, with the set you logged in step 1 still showing, and the elapsed timer showing real elapsed time (not reset to 0).
4. Log a second set. Reload the entire browser page (hard refresh). Confirm the app re-enters directly into the same in-progress workout (not the Templates list, not a fresh empty workout) with both logged sets intact.
5. Tap the Back arrow (top-left) to go to the template's detail screen. Confirm the workout is NOT lost — tap Start again on the same template and confirm it resumes with both sets still logged (not a fresh restart).
6. From that same template's detail screen, tap the Back arrow again to go to the Templates list, then open a **different** template and tap Start. Confirm you get the blocking message naming the in-progress template's name, and you are NOT taken into a fresh workout for the second template.
7. Go back to the Workout tab to return to the in-progress workout. Tap **discard**, confirm the browser confirm dialog, confirm it. Confirm you land back on the template's detail screen and the draft is gone (check via `await (await import("/src/lib/db.ts")).getActiveWorkoutDraft()` in the console — expect `undefined`).
8. Now start a fresh workout on the SAME template, confirm it starts empty (no leftover logged sets from the discarded draft).
9. Log a set, then click **Finish** normally. Confirm the summary screen appears as before, and confirm the draft is cleared (`getActiveWorkoutDraft()` → `undefined`) while the finished session appears correctly in History.
10. Tap the Workout tab again — confirm it now quick-starts via the normal "most recently used template" resolution (no draft exists), landing on the template's detail screen rather than jumping into a workout.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: resolve in-progress workout draft before last-used-template navigation"
```

---

## Self-Review Notes

- Spec coverage: Subsystem A (data layer + `deleteTemplate` edge case), B (resume/persist/discard in `ActiveWorkout`), C (block concurrent workout in `TemplateDetail`), D (navigation resolution in `App.tsx`) are all covered across Tasks 1-4.
- Type consistency: `ActiveWorkoutDraft`, `getActiveWorkoutDraft`, `saveActiveWorkoutDraft`, `clearActiveWorkoutDraft` are spelled identically everywhere they're consumed across Tasks 1-4.
- The elapsed-time fix (derived from `startedAt.current` each tick rather than an incrementing counter) is folded into Task 2 since it's a small, directly-related correctness fix needed for resume to display the right duration — not a separate task, per the "fold into the task whose deliverable needs it" guidance.
- `clearActiveWorkoutDraft()`'s failure on the Finish path is deliberately swallowed (`.catch(() => {})`) rather than surfaced as an error, since the more important operation (`saveWorkoutSession`) already succeeded by that point — surfacing a scary error after the real save succeeded would be misleading. This is called out explicitly in Task 2's code so a reviewer doesn't mistake it for an accidentally-swallowed error.

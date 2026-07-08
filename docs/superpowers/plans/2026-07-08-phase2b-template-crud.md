# Phase 2b: Template/Exercise CRUD + Rest Timer Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded "Push Day A" template with full multi-template management — a shared exercise library, a Templates list (create/edit/delete), per-template exercise editing (add/remove/configure sets-reps-weight-rest), and a persisted per-exercise rest-timer default.

**Architecture:** `src/lib/db.ts` moves from a flat single-template schema (v1) to two normalized stores — `exercise_library` (shared identity: name + muscle) and `templates` (embedded array of per-template exercise configs, mirroring the "flat embedded" pattern already used for `WorkoutSession`). A v1→v2 IndexedDB migration converts existing single-template data into the new shape on first load. Two new reusable components (`ExerciseConfigEditor`, `ExercisePicker`) handle the add/edit-exercise flow and are used from a new `TemplatesScreen` (list) and an extended `TemplateDetail` (view + edit mode). `ActiveWorkout` and `App.tsx` are updated to thread a real `templateId` instead of assuming one hardcoded template.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 6, `idb` (already installed), Tailwind, shadcn/ui components already in the repo.

## Global Constraints

- TypeScript strict mode: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` (from `tsconfig.app.json`) — every new/changed file must satisfy these with zero errors.
- No test runner is configured in this repo (no vitest/jest). Verification is `npx tsc -b --noEmit` plus manual browser smoke checks via `npm run dev` — do not invent a test framework as part of this plan.
- Path alias `@/*` maps to `./src/*`.
- Design system: dark background `hsl(var(--background))`, electric-lime primary `hsl(var(--primary))`, `font-mono`/`'DM Mono', monospace` for numeric/label text, existing global CSS classes `.stepper`/`.stepper-btn`/`.stepper-input`/`.set-chip`/`.auth-input` — reuse these, match `ExerciseCard.tsx`/`TemplateDetail.tsx`/`AuthScreen.tsx` conventions rather than inventing new patterns.
- Library exercise deletion when in use by ≥1 template must be blocked with a message naming the templates using it (never a silent no-op, never a cascade delete).
- Renaming or deleting a template must never mutate past `WorkoutSession` records — those keep their own name/set snapshot independent of the live template (existing Phase 2a design decision).
- Out of scope for this plan: drag-to-reorder exercises/templates, template duplication, a standalone exercise-library screen, Supabase sync, HistoryAnalytics real-data wiring.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db.ts` | Rewrite — v2 schema (`exercise_library`, `templates`), v1→v2 migration, full CRUD API |
| `src/components/ExerciseConfigEditor.tsx` | New — modal editor for one exercise's sets/reps/weight/rest within a template |
| `src/components/ExercisePicker.tsx` | New — modal picker: search/pick a library exercise, inline-create a new one, delete a library exercise (blocked if in use) |
| `src/screens/TemplatesScreen.tsx` | New — template list, "last performed" per template, "+ New Template" |
| `src/screens/TemplateDetail.tsx` | Rewrite — `templateId` prop, view mode (dynamic name/empty state), edit mode (rename, add/edit/delete exercises, delete template) |
| `src/screens/ActiveWorkout.tsx` | Modify — `templateId` prop, load exercises/name for that template |
| `src/App.tsx` | Rewrite — new `"templates"` screen, `activeTemplateId` state, most-recently-used resolution |
| `src/index.css` | Modify — add `.config-editor-overlay`/`.config-editor-panel` (Task 2) and `.exercise-picker-row`/`.exercise-picker-row-main` (Task 3) |

---

## Task 1: Data layer — v2 schema, migration, full CRUD API

**Files:**
- Modify: `src/lib/db.ts` (full rewrite)

**Interfaces:**
- Consumes: `SEED_EXERCISES`, `Exercise` from `@/lib/data` (unchanged).
- Produces (new/changed exports every later task relies on — exact names/types):
  ```ts
  export interface LibraryExercise { id: string; name: string; muscle: string; }
  export interface TemplateExerciseConfig {
    exerciseId: string;
    order: number;
    targetSets: number;
    repsMin: number;
    repsMax: number;
    targetWeight: number;
    restSeconds: number;
  }
  export interface Template { id: string; name: string; exercises: TemplateExerciseConfig[]; }

  export function getTemplates(): Promise<Template[]>;
  export function getTemplate(id: string): Promise<Template | undefined>;
  export function saveTemplate(template: Template): Promise<void>;
  export function deleteTemplate(id: string): Promise<void>;
  export function getExerciseLibrary(): Promise<LibraryExercise[]>;
  export function saveLibraryExercise(exercise: LibraryExercise): Promise<void>;
  export function deleteLibraryExercise(id: string): Promise<{ ok: true } | { ok: false; usedIn: string[] }>;
  export function getExercises(templateId: string): Promise<Exercise[]>;
  export function getLastUsedTemplateId(): Promise<string | null>;
  ```
  Unchanged exports (do not modify): `WorkoutSession`, `saveWorkoutSession`, `getWorkoutSessions`, `getPR`, `sessionVolume`, `sessionSetCount`.
  Removed: the old no-argument `getExercises()` and the internal `ExerciseRecord` interface (replaced by `TemplateExerciseConfig`/`LibraryExercise`).

- [ ] **Step 1: Replace `src/lib/db.ts` in full**

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
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBPDatabase<PeakDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PeakDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PeakDB>("peak-db", 2, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
          sessionStore.createIndex("startedAt", "startedAt");
        }

        if (oldVersion < 2) {
          const libraryStore = db.createObjectStore("exercise_library", { keyPath: "id" });
          const templateStore = db.createObjectStore("templates", { keyPath: "id" });

          if (oldVersion === 1) {
            // "exercises" is no longer part of the typed v2 schema (removed below),
            // so we reach it through the raw transaction for this one-time migration.
            const rawTx = transaction as unknown as IDBTransaction;
            const oldStore = rawTx.objectStore("exercises");
            const oldRecords = await promisifyRequest(
              oldStore.getAll() as IDBRequest<ExerciseRecordV1[]>
            );

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
            // known store name in the typed v2 schema.
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
    const match = templates.find((t) => t.name === sessions[i].templateName);
    if (match) return match.id;
  }
  if (templates.length === 0) return null;
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0].id;
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
console.log(await db.getTemplates());
console.log(await db.getExerciseLibrary());
console.log(await db.getLastUsedTemplateId());
```

Expected:
- If this browser profile already has Phase 2a `peak-db` v1 data (e.g. from earlier testing): the migration ran — `getTemplates()` returns one template named `"Push Day A"` with a 3-entry `exercises` array, `getExerciseLibrary()` returns 3 entries (Bench Press/Incline DB Press/Tricep Pushdown), and any previously-saved `workout_sessions` are untouched (check `await db.getWorkoutSessions()` still returns them).
- If this is a fresh IndexedDB (no prior `peak-db`, or a different browser profile): same end state — one `"Push Day A"` template seeded directly, matching the fresh-install branch.
- `getLastUsedTemplateId()` returns that template's `id` (either because a session's `templateName` matches, or via the alphabetical-first fallback if no sessions exist).

If you have access to a browser profile with existing v1 data (this repo's own dev/test browser profile very likely does, from Phase 2a's manual smoke test), verify the migration path specifically — this is the one code path that can't be exercised by a fresh install alone.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: migrate IndexedDB schema to multi-template + shared exercise library"
```

---

## Task 2: `ExerciseConfigEditor` component

**Files:**
- Create: `src/components/ExerciseConfigEditor.tsx`
- Modify: `src/index.css` (append new rules)

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`; global `.stepper`/`.stepper-btn`/`.stepper-input` CSS classes (already exist, see `ExerciseCard.tsx`).
- Produces (used by Task 6):
  ```ts
  export interface ExerciseConfigValues {
    targetSets: number;
    repsMin: number;
    repsMax: number;
    targetWeight: number;
    restSeconds: number;
  }
  interface ExerciseConfigEditorProps {
    exerciseName: string;
    initial: ExerciseConfigValues;
    onSave: (values: ExerciseConfigValues) => void;
    onCancel: () => void;
  }
  export function ExerciseConfigEditor(props: ExerciseConfigEditorProps): JSX.Element;
  ```

- [ ] **Step 1: Append modal CSS to `src/index.css`**

```css

/* ── Config Editor / Picker Modal ────────────── */
.config-editor-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 20px;
}

.config-editor-panel {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  padding: 20px;
  width: 100%;
  max-width: 360px;
}
```

- [ ] **Step 2: Write `src/components/ExerciseConfigEditor.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface ExerciseConfigValues {
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

interface ExerciseConfigEditorProps {
  exerciseName: string;
  initial: ExerciseConfigValues;
  onSave: (values: ExerciseConfigValues) => void;
  onCancel: () => void;
}

export function ExerciseConfigEditor({
  exerciseName,
  initial,
  onSave,
  onCancel,
}: ExerciseConfigEditorProps) {
  const [targetSets, setTargetSets] = useState(initial.targetSets);
  const [repsMin, setRepsMin] = useState(initial.repsMin);
  const [repsMax, setRepsMax] = useState(initial.repsMax);
  const [targetWeight, setTargetWeight] = useState(initial.targetWeight);
  const [restSeconds, setRestSeconds] = useState(initial.restSeconds);

  const fields: [string, number, (v: number) => void, number, number][] = [
    ["Sets", targetSets, setTargetSets, 1, 1],
    ["Reps min", repsMin, setRepsMin, 1, 1],
    ["Reps max", repsMax, setRepsMax, 1, 1],
    ["Weight (kg)", targetWeight, setTargetWeight, 2.5, 0],
    ["Rest (sec)", restSeconds, setRestSeconds, 15, 0],
  ];

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-4">{exerciseName}</p>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {fields.map(([label, val, setter, step, min]) => (
            <div key={label}>
              <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
              <div className="stepper">
                <button
                  className="stepper-btn"
                  onClick={() => setter(Math.max(min, val - step))}
                >
                  −
                </button>
                <input
                  className="stepper-input"
                  value={val}
                  onChange={(e) => setter(Number(e.target.value) || 0)}
                />
                <button className="stepper-btn" onClick={() => setter(val + step)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            onClick={() =>
              onSave({ targetSets, repsMin, repsMax, targetWeight, restSeconds })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `ExerciseConfigEditor.tsx`. (This component isn't rendered from anywhere yet — Task 6 wires it up — so this is purely a compile check at this point.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ExerciseConfigEditor.tsx src/index.css
git commit -m "feat: add ExerciseConfigEditor component for per-template exercise settings"
```

---

## Task 3: `ExercisePicker` component

**Files:**
- Create: `src/components/ExercisePicker.tsx`
- Modify: `src/index.css` (append new rules)

**Interfaces:**
- Consumes: `LibraryExercise`, `getExerciseLibrary`, `saveLibraryExercise`, `deleteLibraryExercise` from `@/lib/db` (Task 1); `Badge` from `@/components/ui/badge`; `Button` from `@/components/ui/button`; `.config-editor-overlay`/`.config-editor-panel` CSS (Task 2).
- Produces (used by Task 6):
  ```ts
  interface ExercisePickerProps {
    existingExerciseIds: string[];
    onPick: (exercise: LibraryExercise) => void;
    onCancel: () => void;
  }
  export function ExercisePicker(props: ExercisePickerProps): JSX.Element;
  ```

- [ ] **Step 1: Append picker-row CSS to `src/index.css`**

```css

.exercise-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
}

.exercise-picker-row-main {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.exercise-picker-row-main:hover {
  color: hsl(var(--primary));
}
```

- [ ] **Step 2: Write `src/components/ExercisePicker.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getExerciseLibrary,
  saveLibraryExercise,
  deleteLibraryExercise,
  type LibraryExercise,
} from "@/lib/db";

const TEXT_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  padding: "10px 12px",
  color: "hsl(var(--foreground))",
  fontFamily: "'DM Mono', monospace",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

interface ExercisePickerProps {
  existingExerciseIds: string[];
  onPick: (exercise: LibraryExercise) => void;
  onCancel: () => void;
}

export function ExercisePicker({
  existingExerciseIds,
  onPick,
  onCancel,
}: ExercisePickerProps) {
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [filter, setFilter] = useState("");
  const [creatingMuscle, setCreatingMuscle] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = () => getExerciseLibrary().then(setLibrary);

  useEffect(() => {
    reload();
  }, []);

  const available = library.filter((ex) => !existingExerciseIds.includes(ex.id));
  const filtered = available.filter((ex) =>
    ex.name.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const exactMatch = library.some(
    (ex) => ex.name.toLowerCase() === filter.trim().toLowerCase()
  );
  const canCreate = filter.trim().length > 0 && !exactMatch;

  const handleCreate = async () => {
    const newExercise: LibraryExercise = {
      id: crypto.randomUUID(),
      name: filter.trim(),
      muscle: creatingMuscle.trim() || "Other",
    };
    await saveLibraryExercise(newExercise);
    onPick(newExercise);
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteError(null);
    const result = await deleteLibraryExercise(id);
    if (result.ok) {
      reload();
    } else {
      setDeleteError(
        `"${name}" is used in ${result.usedIn.join(", ")} — remove it from those templates first.`
      );
    }
  };

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-3">Add exercise</p>
        <input
          style={{ ...TEXT_INPUT_STYLE, marginBottom: 12 }}
          placeholder="Search or create exercise"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />

        {deleteError && (
          <p
            className="font-mono text-[11px] mb-2"
            style={{ color: "hsl(var(--destructive))" }}
          >
            {deleteError}
          </p>
        )}

        <div
          className="flex flex-col gap-1.5 mb-4"
          style={{ maxHeight: 240, overflowY: "auto" }}
        >
          {filtered.map((ex) => (
            <div key={ex.id} className="exercise-picker-row">
              <button className="exercise-picker-row-main" onClick={() => onPick(ex)}>
                <span className="text-[14px]">{ex.name}</span>
                <Badge
                  variant="secondary"
                  style={{
                    fontSize: 10,
                    padding: "1px 7px",
                    color: "#a78bfa",
                    background: "hsl(262 80% 58% / 0.15)",
                  }}
                >
                  {ex.muscle}
                </Badge>
              </button>
              <button
                onClick={() => handleDelete(ex.id, ex.name)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--destructive))",
                  fontSize: 15,
                  padding: "2px 6px",
                }}
              >
                ×
              </button>
            </div>
          ))}
          {filtered.length === 0 && !canCreate && (
            <p className="text-[13px] text-muted-foreground italic">No exercises found</p>
          )}
        </div>

        {canCreate && (
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Create "{filter.trim()}" — muscle group
            </p>
            <input
              style={TEXT_INPUT_STYLE}
              placeholder="e.g. Chest"
              value={creatingMuscle}
              onChange={(e) => setCreatingMuscle(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          {canCreate && (
            <Button className="flex-1 font-semibold" onClick={handleCreate}>
              Create & configure
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `ExercisePicker.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExercisePicker.tsx src/index.css
git commit -m "feat: add ExercisePicker component for library search/create/delete"
```

---

## Task 4: `TemplatesScreen` (list + create)

**Files:**
- Create: `src/screens/TemplatesScreen.tsx`

**Interfaces:**
- Consumes: `getTemplates`, `getWorkoutSessions`, `saveTemplate`, `type Template` from `@/lib/db` (Task 1); `fmtRelativeDate` from `@/lib/utils` (Phase 2a).
- Produces (used by Task 7):
  ```ts
  interface TemplatesScreenProps {
    onSelectTemplate: (id: string) => void;
    onCreateTemplate: (id: string) => void;
  }
  export function TemplatesScreen(props: TemplatesScreenProps): JSX.Element;
  ```

- [ ] **Step 1: Write `src/screens/TemplatesScreen.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import { fmtRelativeDate } from "@/lib/utils";
import { getTemplates, getWorkoutSessions, saveTemplate, type Template } from "@/lib/db";

interface TemplatesScreenProps {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (id: string) => void;
}

const NEW_TEMPLATE_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  padding: "10px 12px",
  color: "hsl(var(--foreground))",
  fontFamily: "'DM Mono', monospace",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export function TemplatesScreen({ onSelectTemplate, onCreateTemplate }: TemplatesScreenProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lastPerformed, setLastPerformed] = useState<Map<string, number>>(new Map());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates);
    getWorkoutSessions().then((sessions) => {
      const map = new Map<string, number>();
      for (const s of sessions) {
        if (!map.has(s.templateName)) map.set(s.templateName, s.startedAt);
      }
      setLastPerformed(map);
    });
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const template: Template = { id: crypto.randomUUID(), name, exercises: [] };
    await saveTemplate(template);
    onCreateTemplate(template.id);
  };

  return (
    <div>
      <TopBar title="Templates" />

      <div className="px-5 pt-4 pb-24 flex flex-col gap-2.5">
        {templates.map((t) => {
          const lastTs = lastPerformed.get(t.name);
          return (
            <Card
              key={t.id}
              onClick={() => onSelectTemplate(t.id)}
              className="cursor-pointer transition-colors"
            >
              <CardContent
                style={{ padding: "14px 16px" }}
                className="flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-[15px]">{t.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {lastTs ? fmtRelativeDate(lastTs) : "Never"}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {creating ? (
          <Card>
            <CardContent style={{ padding: 14 }} className="flex flex-col gap-2.5">
              <input
                style={NEW_TEMPLATE_INPUT_STYLE}
                placeholder="Template name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </Button>
                <Button className="flex-1 font-semibold" onClick={handleCreate}>
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            className="text-muted-foreground rounded-xl h-auto py-4"
            style={{ border: "1px dashed hsl(var(--border))" }}
            onClick={() => setCreating(true)}
          >
            + New Template
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `TemplatesScreen.tsx`. (Not rendered from anywhere yet — Task 7 wires it into `App.tsx` — this is a compile check.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/TemplatesScreen.tsx
git commit -m "feat: add TemplatesScreen list with create-template flow"
```

---

## Task 5: `TemplateDetail` — dynamic view mode

**Files:**
- Modify: `src/screens/TemplateDetail.tsx` (full rewrite; edit mode comes in Task 6)

**Interfaces:**
- Consumes: `getTemplate`, `getExercises`, `getWorkoutSessions`, `type Template` from `@/lib/db` (Task 1); `fmtRelativeDate` from `@/lib/utils`; `fmtTime`, `type Exercise` from `@/lib/data`.
- Produces (props later tasks/`App.tsx` rely on):
  ```ts
  interface TemplateDetailProps {
    templateId: string;
    onStart: () => void;
    onBack: () => void;
    onSignOut: () => void;
  }
  export function TemplateDetail(props: TemplateDetailProps): JSX.Element | null;
  ```

- [ ] **Step 1: Replace `src/screens/TemplateDetail.tsx` in full**

```tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TopBar } from "@/components/TopBar";
import { fmtTime, type Exercise } from "@/lib/data";
import { fmtRelativeDate } from "@/lib/utils";
import { getTemplate, getExercises, getWorkoutSessions, type Template } from "@/lib/db";

interface TemplateDetailProps {
  templateId: string;
  onStart: () => void;
  onBack: () => void;
  onSignOut: () => void;
}

export function TemplateDetail({ templateId, onStart, onBack, onSignOut }: TemplateDetailProps) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);

  useEffect(() => {
    getTemplate(templateId).then((t) => setTemplate(t ?? null));
    getExercises(templateId).then(setExercises);
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    getWorkoutSessions().then((sessions) => {
      const match = sessions.find((s) => s.templateName === template.name);
      setLastPerformed(match ? fmtRelativeDate(match.startedAt) : null);
    });
  }, [template]);

  if (!template) return null;

  const totalTargetSets = exercises.reduce((a, e) => a + e.targetSets, 0);
  const avgSeconds = exercises.reduce((a, e) => a + e.restSeconds * e.targetSets, 0);

  return (
    <div>
      <TopBar
        title={template.name}
        sub={lastPerformed ? `Last performed ${lastPerformed}` : "Never performed"}
        onBack={onBack}
        right={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={onSignOut}
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
              sign out
            </button>
            <Button
              onClick={onStart}
              disabled={exercises.length === 0}
              className="font-semibold tracking-tight"
            >
              Start
            </Button>
          </div>
        }
      />

      {exercises.length === 0 ? (
        <div className="px-5 pt-10 text-center">
          <p className="text-muted-foreground text-sm">No exercises yet — tap + Add exercise</p>
        </div>
      ) : (
        <>
          <div className="px-5 pt-4">
            <Card>
              <CardContent style={{ padding: "16px 20px" }} className="flex gap-7">
                {(
                  [
                    [String(exercises.length), "exercises"],
                    [String(totalTargetSets), "total sets"],
                    [`~${Math.round(avgSeconds / 60)}`, "min avg"],
                  ] as const
                ).map(([v, l]) => (
                  <div key={l}>
                    <p className="font-mono text-2xl font-medium">{v}</p>
                    <p className="text-[11px] text-muted-foreground mt-px">{l}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="px-5 pt-3.5 pb-24 flex flex-col gap-2.5">
            {exercises.map((ex, i) => (
              <Card key={ex.id}>
                <CardHeader style={{ padding: "14px 16px 10px" }}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground min-w-[20px]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="font-semibold text-[15px]">{ex.name}</p>
                        <div className="flex gap-1.5 items-center mt-1">
                          <Badge
                            variant="secondary"
                            style={{
                              fontSize: 10,
                              padding: "1px 7px",
                              color: "#a78bfa",
                              background: "hsl(262 80% 58% / 0.15)",
                            }}
                          >
                            {ex.muscle}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ⏱ {fmtTime(ex.restSeconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm">
                        {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                        @ {ex.targetWeight} kg
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent style={{ padding: "12px 16px" }}>
                  {ex.last ? (
                    <>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
                        Last session
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {ex.last.map((s, j) => (
                          <span key={j} className="set-chip">
                            {s.r}×{s.w}kg
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="font-mono text-[11px] text-muted-foreground italic">
                      No previous data
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: errors will appear in `src/App.tsx` (still passing the old no-`templateId` props) and `src/screens/ActiveWorkout.tsx` is unaffected yet — these are expected at this point in the plan (Task 7 fixes `App.tsx`; do not fix it now). Confirm the only errors are in `src/App.tsx` referencing `TemplateDetail`'s props.

- [ ] **Step 3: Commit**

```bash
git add src/screens/TemplateDetail.tsx
git commit -m "feat: load TemplateDetail from a real templateId with empty-state handling"
```

---

## Task 6: `TemplateDetail` — edit mode

**Files:**
- Modify: `src/screens/TemplateDetail.tsx`

**Interfaces:**
- Consumes: `ExerciseConfigEditor`, `type ExerciseConfigValues` from `@/components/ExerciseConfigEditor` (Task 2); `ExercisePicker` from `@/components/ExercisePicker` (Task 3); `saveTemplate`, `deleteTemplate`, `type LibraryExercise` from `@/lib/db` (Task 1).
- No prop changes — `TemplateDetailProps` stays exactly as Task 5 defined it.

- [ ] **Step 1: Replace `src/screens/TemplateDetail.tsx` in full**

```tsx
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TopBar } from "@/components/TopBar";
import { ExerciseConfigEditor, type ExerciseConfigValues } from "@/components/ExerciseConfigEditor";
import { ExercisePicker } from "@/components/ExercisePicker";
import { fmtTime, type Exercise } from "@/lib/data";
import { fmtRelativeDate } from "@/lib/utils";
import {
  getTemplate,
  getExercises,
  getWorkoutSessions,
  saveTemplate,
  deleteTemplate,
  type Template,
  type LibraryExercise,
} from "@/lib/db";

interface TemplateDetailProps {
  templateId: string;
  onStart: () => void;
  onBack: () => void;
  onSignOut: () => void;
}

const DEFAULT_CONFIG: ExerciseConfigValues = {
  targetSets: 4,
  repsMin: 6,
  repsMax: 8,
  targetWeight: 20,
  restSeconds: 90,
};

const RENAME_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  padding: "10px 12px",
  color: "hsl(var(--foreground))",
  fontFamily: "'DM Mono', monospace",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export function TemplateDetail({ templateId, onStart, onBack, onSignOut }: TemplateDetailProps) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingExisting, setEditingExisting] = useState<{ exerciseId: string; name: string } | null>(null);
  const [addingNew, setAddingNew] = useState<LibraryExercise | null>(null);
  const [pickingExercise, setPickingExercise] = useState(false);
  const autoEditApplied = useRef(false);

  const reload = () => {
    getTemplate(templateId).then((t) => setTemplate(t ?? null));
    getExercises(templateId).then(setExercises);
  };

  useEffect(() => {
    reload();
    autoEditApplied.current = false;
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    if (template.exercises.length === 0 && !autoEditApplied.current) {
      setEditMode(true);
      autoEditApplied.current = true;
    }
    getWorkoutSessions().then((sessions) => {
      const match = sessions.find((s) => s.templateName === template.name);
      setLastPerformed(match ? fmtRelativeDate(match.startedAt) : null);
    });
  }, [template]);

  if (!template) return null;

  const totalTargetSets = exercises.reduce((a, e) => a + e.targetSets, 0);
  const avgSeconds = exercises.reduce((a, e) => a + e.restSeconds * e.targetSets, 0);

  const handleRename = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === template.name) return;
    const updated = { ...template, name: trimmed };
    setTemplate(updated);
    saveTemplate(updated);
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    const updated: Template = {
      ...template,
      exercises: template.exercises
        .filter((e) => e.exerciseId !== exerciseId)
        .map((e, i) => ({ ...e, order: i })),
    };
    await saveTemplate(updated);
    reload();
  };

  const handleSaveConfig = async (exerciseId: string, values: ExerciseConfigValues) => {
    const exists = template.exercises.some((e) => e.exerciseId === exerciseId);
    const updated: Template = {
      ...template,
      exercises: exists
        ? template.exercises.map((e) =>
            e.exerciseId === exerciseId ? { ...e, ...values } : e
          )
        : [...template.exercises, { exerciseId, order: template.exercises.length, ...values }],
    };
    await saveTemplate(updated);
    setEditingExisting(null);
    setAddingNew(null);
    reload();
  };

  const handleDeleteTemplate = async () => {
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    await deleteTemplate(templateId);
    onBack();
  };

  const editingExistingConfig: ExerciseConfigValues | undefined = editingExisting
    ? template.exercises.find((e) => e.exerciseId === editingExisting.exerciseId)
    : undefined;

  return (
    <div>
      <TopBar
        title={template.name}
        sub={lastPerformed ? `Last performed ${lastPerformed}` : "Never performed"}
        onBack={onBack}
        right={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={onSignOut}
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
              sign out
            </button>
            <button
              onClick={() => setEditMode((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: editMode ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                fontSize: 16,
                padding: "4px 6px",
              }}
            >
              ✎
            </button>
            {!editMode && (
              <Button
                onClick={onStart}
                disabled={exercises.length === 0}
                className="font-semibold tracking-tight"
              >
                Start
              </Button>
            )}
          </div>
        }
      />

      {editMode && (
        <div className="px-5 pt-3 flex flex-col gap-2.5">
          <input
            style={RENAME_INPUT_STYLE}
            defaultValue={template.name}
            onBlur={(e) => handleRename(e.target.value)}
          />
          <Button variant="destructive" className="w-full" onClick={handleDeleteTemplate}>
            Delete template
          </Button>
        </div>
      )}

      {exercises.length === 0 && !editMode ? (
        <div className="px-5 pt-10 text-center">
          <p className="text-muted-foreground text-sm">No exercises yet — tap + Add exercise</p>
        </div>
      ) : (
        <>
          {exercises.length > 0 && (
            <div className="px-5 pt-4">
              <Card>
                <CardContent style={{ padding: "16px 20px" }} className="flex gap-7">
                  {(
                    [
                      [String(exercises.length), "exercises"],
                      [String(totalTargetSets), "total sets"],
                      [`~${Math.round(avgSeconds / 60)}`, "min avg"],
                    ] as const
                  ).map(([v, l]) => (
                    <div key={l}>
                      <p className="font-mono text-2xl font-medium">{v}</p>
                      <p className="text-[11px] text-muted-foreground mt-px">{l}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="px-5 pt-3.5 pb-24 flex flex-col gap-2.5">
            {exercises.map((ex, i) => (
              <Card
                key={ex.id}
                onClick={() => editMode && setEditingExisting({ exerciseId: ex.id, name: ex.name })}
                style={{ cursor: editMode ? "pointer" : "default" }}
              >
                <CardHeader style={{ padding: "14px 16px 10px" }}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground min-w-[20px]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="font-semibold text-[15px]">{ex.name}</p>
                        <div className="flex gap-1.5 items-center mt-1">
                          <Badge
                            variant="secondary"
                            style={{
                              fontSize: 10,
                              padding: "1px 7px",
                              color: "#a78bfa",
                              background: "hsl(262 80% 58% / 0.15)",
                            }}
                          >
                            {ex.muscle}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ⏱ {fmtTime(ex.restSeconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <p className="font-mono text-sm">
                          {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                          @ {ex.targetWeight} kg
                        </p>
                      </div>
                      {editMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteExercise(ex.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "hsl(var(--destructive))",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: "2px 4px",
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent style={{ padding: "12px 16px" }}>
                  {ex.last ? (
                    <>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
                        Last session
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {ex.last.map((s, j) => (
                          <span key={j} className="set-chip">
                            {s.r}×{s.w}kg
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="font-mono text-[11px] text-muted-foreground italic">
                      No previous data
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {editMode && (
              <Button
                variant="outline"
                className="text-muted-foreground rounded-xl h-auto py-4"
                style={{ border: "1px dashed hsl(var(--border))" }}
                onClick={() => setPickingExercise(true)}
              >
                + Add exercise
              </Button>
            )}
          </div>
        </>
      )}

      {editingExisting && editingExistingConfig && (
        <ExerciseConfigEditor
          exerciseName={editingExisting.name}
          initial={editingExistingConfig}
          onSave={(values) => handleSaveConfig(editingExisting.exerciseId, values)}
          onCancel={() => setEditingExisting(null)}
        />
      )}

      {addingNew && (
        <ExerciseConfigEditor
          exerciseName={addingNew.name}
          initial={DEFAULT_CONFIG}
          onSave={(values) => handleSaveConfig(addingNew.id, values)}
          onCancel={() => setAddingNew(null)}
        />
      )}

      {pickingExercise && (
        <ExercisePicker
          existingExerciseIds={template.exercises.map((e) => e.exerciseId)}
          onPick={(libraryExercise) => {
            setPickingExercise(false);
            setAddingNew(libraryExercise);
          }}
          onCancel={() => setPickingExercise(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: same pre-existing `src/App.tsx` errors as after Task 5 (not yet fixed — Task 7 handles it), and no NEW errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/screens/TemplateDetail.tsx
git commit -m "feat: add TemplateDetail edit mode (rename, add/edit/delete exercises, delete template)"
```

---

## Task 7: Wire `ActiveWorkout` + `App.tsx`, full smoke test

**Files:**
- Modify: `src/screens/ActiveWorkout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getExercises(templateId)`, `getTemplate`, `getLastUsedTemplateId` from `@/lib/db` (Task 1); `TemplatesScreen` (Task 4); `TemplateDetail` (Tasks 5/6, unchanged props).

- [ ] **Step 1: Modify `src/screens/ActiveWorkout.tsx`**

Change the imports and the top of the component to thread a real `templateId` and load that template's real name. Replace:

```tsx
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
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getExercises().then((exs) => {
      setExercises(exs);
      if (exs.length > 0) setActiveId(exs[0].id);
    });
  }, []);
```

with:

```tsx
import { getExercises, getTemplate, saveWorkoutSession, getPR, type WorkoutSession } from "@/lib/db";

interface ActiveWorkoutProps {
  templateId: string;
  onBack: () => void;
  onFinish: () => void;
}

export function ActiveWorkout({ templateId, onBack, onFinish }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getExercises(templateId)
      .then((exs) => {
        setExercises(exs);
        if (exs.length > 0) setActiveId(exs[0].id);
      })
      .catch(() => setLoadError("Couldn't load exercises — try reloading."));
    getTemplate(templateId).then((t) => setTemplateName(t?.name ?? "Workout"));
  }, [templateId]);
```

(Keep the file's existing `loadError` rendering, `finishError` rendering, `isFinishing` guard, and the rest of `handleFinish` from Phase 2a exactly as they are — this task only changes the two blocks shown above. If your current `ActiveWorkout.tsx` doesn't yet have `loadError`/`isFinishing` state from a prior fix, check `git log -p -- src/screens/ActiveWorkout.tsx` for the `741344a` commit — this plan assumes that commit's version as the starting point.)

Then find the two remaining hardcoded `"Push Day A"` references in the same file and replace them:

```tsx
        templateName: "Push Day A",
```
→
```tsx
        templateName: templateName || "Workout",
```

and:

```tsx
        <TopBar
          title="Push Day A"
```
→
```tsx
        <TopBar
          title={templateName || "Workout"}
```

- [ ] **Step 2: Type-check** (expect `App.tsx` errors still, unrelated to this step)

Run: `npx tsc -b --noEmit`
Expected: errors only in `src/App.tsx` (not yet updated); zero errors in `ActiveWorkout.tsx`.

- [ ] **Step 3: Replace `src/App.tsx` in full**

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
import { getLastUsedTemplateId } from "@/lib/db";

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
    getLastUsedTemplateId().then((id) => {
      if (id) {
        setActiveTemplateId(id);
        setScreen("template");
      } else {
        setScreen("templates");
      }
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

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

In the browser (sign in with the test account first):
1. Land on the Templates tab (or the quick-start template detail, if this browser profile already has workout history) — confirm no console errors.
2. Go to the **Templates** tab. Confirm the existing "Push Day A" template (from the v1→v2 migration or fresh seed) is listed with its exercise count and last-performed date.
3. Tap **+ New Template**, name it "Pull Day", confirm it navigates straight into the new template's detail screen in **edit mode** (since it has zero exercises) with the empty state visible and Start disabled.
4. Tap **+ Add exercise** — confirm the picker shows existing library exercises (Bench Press, Incline DB Press, Tricep Pushdown) plus a "Create" option if you type a new name. Create a new exercise "Deadlift" with muscle "Back" — confirm it opens the config editor pre-filled with the defaults (4 sets / 6-8 reps / 20kg / 90s), adjust the rest to 120s, save.
5. Confirm "Deadlift" now appears in the Pull Day template's exercise list with the rest you set, and Start is now enabled.
6. Toggle edit mode off (pencil icon) — confirm the view returns to the normal read-only layout.
7. Toggle edit mode back on, tap the Deadlift exercise row, confirm the config editor opens pre-filled with its current values (including the 120s rest you set), change target weight, save — confirm the row updates.
8. Tap the × on the Deadlift row to remove it from the template — confirm it disappears and (since the template now has 0 exercises again) Start becomes disabled.
9. Go back to the Templates list (back arrow). Open "Push Day A", toggle edit mode, tap **+ Add exercise**, and confirm "Bench Press" etc. are NOT shown as pickable again if they're already in this template (the `existingExerciseIds` filter) — but ARE available when adding to the "Pull Day" template (which doesn't have them yet).
10. In "Push Day A" edit mode, tap the Bench Press row, change its rest from whatever it is to a new value (e.g. 150s), save. Exit edit mode, tap **Start** — confirm logging a set on Bench Press now opens the rest timer with the new duration you set (not the old default).
11. From the picker (either template, edit mode → + Add exercise), try to delete a library exercise that's currently used by a template (e.g. try deleting "Bench Press" while it's still in "Push Day A") — confirm you get the blocking message naming the template, and it is NOT deleted.
12. Remove Bench Press from every template it's in, then delete it from the library via the picker's × — confirm it's now gone from the library and no longer offered anywhere.
13. Go to the **Workout** tab — confirm it quick-starts whichever template you most recently performed a workout in (or the first alphabetically if you haven't finished a workout yet this session). Start and finish a quick workout to confirm the full `ActiveWorkout` → `WorkoutSummary` → History flow (from Phase 2a) still works end-to-end with the new template-driven data, and that the saved session's `templateName` matches the real template name (not "Push Day A" hardcoded) if you used "Pull Day" or a renamed template.
14. Rename a template (edit mode, blur the name field) — confirm the Templates list shows the new name, but any workout history saved before the rename still shows the OLD name (snapshot behavior, not retroactively renamed).
15. Delete a template (edit mode → Delete template, confirm the browser confirm dialog) — confirm it's removed from the Templates list and, if it was the Workout-tab quick-start target, the Workout tab now resolves to a different template.

- [ ] **Step 6: Commit**

```bash
git add src/screens/ActiveWorkout.tsx src/App.tsx
git commit -m "feat: wire real template selection through ActiveWorkout and App navigation"
```

---

## Self-Review Notes

- Spec coverage: Subsystem A (data layer + migration), B (Templates list), C (Template Detail view + edit), D (Exercise Picker incl. delete-guard), E (navigation + ActiveWorkout wiring) are covered across Tasks 1–7.
- Gap closed during planning: the design spec's `deleteLibraryExercise` had no UI trigger in the "inline only" scope — added a delete (×) affordance directly in `ExercisePicker` (Task 3) so the function is actually reachable and the delete-guard is testable.
- Gap closed during planning: without excluding a template's already-used exercises from its own picker, a user could add the same library exercise twice to one template, breaking the assumption (used throughout `TemplateDetail`, `ActiveWorkout`) that `exerciseId` is unique within a template's array. Fixed via `ExercisePicker`'s `existingExerciseIds` prop (Task 3) and `TemplateDetail` passing `template.exercises.map(e => e.exerciseId)` (Task 6).
- Type consistency: `Template`, `TemplateExerciseConfig`, `LibraryExercise`, `ExerciseConfigValues` are spelled identically everywhere they're consumed across Tasks 1–7.
- `ActiveWorkout`'s `templateName` fallback (`"Workout"`) only triggers if `getTemplate` somehow returns nothing for a valid `templateId` — an edge case that shouldn't occur in normal use but avoids an empty-string title if it ever does.

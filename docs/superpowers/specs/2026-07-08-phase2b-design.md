# Phase 2b Design — Template/Exercise CRUD + Rest Timer Editing

**Date:** 2026-07-08
**Scope:** Replace the single hardcoded "Push Day A" template with full multi-template management backed by a shared exercise library, plus persisted per-exercise rest-timer defaults editable from template editing.

---

## Decisions

| Question | Decision |
|---|---|
| Template scope | Full multi-template management (list, create, edit, delete) |
| Exercise identity | Shared `exercise_library` (name + muscle), referenced by templates |
| Exercise-in-template config | Embedded array on the template document (sets/reps/weight/rest per template) |
| Library management UI | Inline only, via an exercise picker inside template editing — no standalone library screen |
| Rest timer | Both: existing ±30s in-workout adjustment stays as-is; new persisted default editable per exercise per template |
| Workout tab behavior | Quick-starts the most-recently-used template |
| Templates tab behavior | Full list — browse/create/edit/delete |
| Library exercise deletion when in use | Blocked with a message naming the templates using it |
| Migration | v1→v2 IndexedDB upgrade converts existing single-template seed data into the new shape |

---

## Subsystem A — Data Layer (`src/lib/db.ts` changes)

### Version bump

`peak-db` moves from version 1 to version 2.

### New/changed stores

**`exercise_library`** (new)
- Key: `id` (string)
- Schema:
```ts
interface LibraryExercise {
  id: string;
  name: string;
  muscle: string;
}
```

**`templates`** (new)
- Key: `id` (string)
- Schema:
```ts
interface Template {
  id: string;
  name: string;
  exercises: {
    exerciseId: string;   // FK into exercise_library
    order: number;
    targetSets: number;
    repsMin: number;
    repsMax: number;
    targetWeight: number;
    restSeconds: number;
  }[];
}
```

**`exercises`** (removed) — the flat v1 store is deleted as part of the v2 upgrade, after migration.

**`workout_sessions`** — unchanged. Sessions already snapshot `templateName` and exercise names/sets independently; no migration needed.

### v1→v2 migration (inside the `upgrade` callback, `oldVersion < 2` branch)

1. Read all records from the old `exercises` store (only present if `oldVersion >= 1`).
2. For each record, create an `exercise_library` entry: `{ id: rec.id, name: rec.name, muscle: rec.muscle }`.
3. Build one `templates` document: `{ id: crypto.randomUUID(), name: "Push Day A", exercises: oldRecords.map((rec, i) => ({ exerciseId: rec.id, order: i, targetSets: rec.targetSets, repsMin: rec.repsMin, repsMax: rec.repsMax, targetWeight: rec.targetWeight, restSeconds: rec.restSeconds })) }`.
4. Delete the old `exercises` object store.

Fresh installs (no `exercises` store at all, `oldVersion === 0`) skip the migration and seed `exercise_library` + one `templates` document directly from `SEED_EXERCISES`, producing the same end state.

### Public API changes

Removed: `getExercises(): Promise<Exercise[]>` (no `templateId` parameter — no longer meaningful with multiple templates).

Added/changed:
```ts
getTemplates(): Promise<Template[]>
getTemplate(id: string): Promise<Template | undefined>
saveTemplate(template: Template): Promise<void>       // create (new id) or full-replace update
deleteTemplate(id: string): Promise<void>
getExerciseLibrary(): Promise<LibraryExercise[]>
saveLibraryExercise(exercise: LibraryExercise): Promise<void>   // create or update
deleteLibraryExercise(id: string): Promise<{ ok: true } | { ok: false; usedIn: string[] }>
getExercises(templateId: string): Promise<Exercise[]>   // re-added with templateId param
```

`getExercises(templateId)` fetches the template, joins each embedded entry against `exercise_library` (for `name`/`muscle`), and hydrates `last` (derived from the most recent `workout_sessions` entry matching that exercise name, same logic as Phase 2a) and `logged: []`, producing the same `Exercise[]` shape `ActiveWorkout` already consumes.

`deleteLibraryExercise(id)` scans all templates; if any template's `exercises` array references `id`, returns `{ ok: false, usedIn: [...template names] }` without deleting. Otherwise deletes and returns `{ ok: true }`.

Unchanged: `saveWorkoutSession`, `getWorkoutSessions`, `getPR`, `sessionVolume`, `sessionSetCount` (all operate on `workout_sessions`, untouched by this migration).

---

## Subsystem B — Templates List Screen (`src/screens/TemplatesScreen.tsx`, new)

- Fetches `getTemplates()` on mount.
- Renders a card per template: name, exercise count, "last performed" (derived by finding the most recent `WorkoutSession` whose `templateName` matches, via `fmtRelativeDate`; "Never" if none).
- "+ New Template" — prompts for a name (simple inline text input, not a separate screen), calls `saveTemplate({ id: crypto.randomUUID(), name, exercises: [] })`, then navigates into `TemplateDetail` for the new template in edit mode.
- Tapping a template card navigates to `TemplateDetail` for that template's id (view mode).

---

## Subsystem C — Template Detail + Editing (`src/screens/TemplateDetail.tsx`, extended)

### Props change

```ts
interface TemplateDetailProps {
  templateId: string;
  onStart: () => void;
  onBack: () => void;
  onSignOut: () => void;
}
```
Loads its own data via `getTemplate(templateId)` + `getExerciseLibrary()` (to resolve names/muscle for display) on mount/when `templateId` changes.

### View mode (default, close to current UI)

Same layout as today: summary stats card, exercise list with last-session chips. Differences: title comes from `template.name` (not hardcoded), and if `template.exercises.length === 0`, the summary card and exercise list are replaced with an empty state ("No exercises yet — tap + Add exercise") and the **Start** button is disabled.

### Edit mode (new)

Toggled via a pencil icon in `TopBar`'s `right` slot (alongside sign-out; Start is hidden while editing). In edit mode:
- Template name becomes an editable text field (rename).
- Each exercise row gains a delete (×) button and becomes tappable, opening an **exercise config editor** (sheet/inline panel, styled like `ExerciseCard`'s existing log-set stepper form) with fields: target sets, reps min/max, target weight, **rest duration** (all stepper inputs, rest in 15s increments). Saving writes back to that entry in the template's `exercises` array and calls `saveTemplate`.
- "+ Add exercise" opens the **exercise picker** (Subsystem D).
- "Delete template" button (with a confirm step) calls `deleteTemplate(templateId)` and navigates back to `TemplatesScreen`.
- Exiting edit mode (pencil toggle again, or back) simply stops rendering the edit affordances — every change is already saved via `saveTemplate` as it happens, no separate "Save" step.

---

## Subsystem D — Exercise Picker (inline component, used from Template Detail edit mode)

A modal/sheet listing `exercise_library` entries (name + muscle badge, matching the styling already used for muscle badges elsewhere), with a text filter at the top. Two ways to proceed:
- Tap an existing library exercise → opens the same config editor as Subsystem C (sets/reps/weight/rest), pre-filled with sensible defaults (e.g. `4 / 6-8 / 20kg / 90s`), on save appends `{ exerciseId, order: nextOrder, ...config }` to the template and calls `saveTemplate`.
- "+ New exercise" (shown when the filter text doesn't match an existing entry, pre-filling the name field) → small form for name + muscle, calls `saveLibraryExercise` to create the library entry, then immediately opens the same config editor to set this template's sets/reps/weight/rest for it.

---

## Subsystem E — Navigation & ActiveWorkout Changes

### `App.tsx`

- New screen state value: `"templates"` (list) alongside existing `"template"` (detail — renamed conceptually to "template detail" but no need to rename the string value), `"workout"`, `"history"`.
- Tracks `activeTemplateId: string | null`, set whenever the user opens a template (from the list, from "+ New Template", or via the Workout-tab quick-start resolution).
- **Templates tab** → sets `screen = "templates"`.
- **Workout tab** → resolves the most-recently-used template id (see below) and sets `screen = "template"` with that id.
- `TemplateDetail`'s `onStart` now passes `activeTemplateId` through to `ActiveWorkout`.

### Most-recently-used template resolution

A small helper (e.g. `getLastUsedTemplateId()` in `db.ts`, or computed in `App.tsx` from `getWorkoutSessions(1)` + `getTemplates()`): take the most recent `WorkoutSession.templateName`, find the template with that name; if no sessions exist yet, fall back to the first template alphabetically; if no templates exist at all (only possible if the user deletes every template), fall back to `TemplatesScreen` with its "+ New Template" prompt instead.

### `ActiveWorkout.tsx`

- Gains a `templateId: string` prop.
- Replaces `getExercises()` with `getExercises(templateId)`.
- Replaces the hardcoded `templateName: "Push Day A"` (in `handleFinish`'s built session) and the hardcoded `TopBar title="Push Day A"` with the real template's name (fetched alongside its exercises, or passed down as a prop from `App.tsx`/`TemplateDetail`).

---

## Out of Scope

- Drag-to-reorder exercises within a template (append-only ordering for now)
- Reordering templates in the list
- Duplicating a template
- A standalone exercise library management screen
- Supabase sync (Phase 3)
- HistoryAnalytics wired to real data (Phase 2d)

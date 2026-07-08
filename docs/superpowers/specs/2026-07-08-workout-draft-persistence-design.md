# Design — Active Workout Draft Persistence

**Date:** 2026-07-08
**Scope:** Fix the gap where navigating away from an in-progress workout (via the Back button or any nav tab) permanently loses all logged progress, since `ActiveWorkout`'s state only ever lived in React component state. Add IndexedDB-backed draft persistence so an in-progress workout survives navigation and page reloads, plus a way to get back to it and a way to explicitly discard it.

---

## Decisions

| Question | Decision |
|---|---|
| Persistence mechanism | IndexedDB draft (survives navigation AND page reload/close), not in-memory-only |
| Explicit discard | Yes — a "Discard workout" action with a confirm step |
| Concurrent workout on a different template | Blocked with a message naming the in-progress template — not silently replaced |

---

## Subsystem A — Data Layer (`src/lib/db.ts`)

### Schema (v2 → v3)

New singleton store `active_workout_draft` — always at most one record, keyed by a constant id `"current"`. No data migration needed (the store starts empty for everyone); the v3 upgrade branch just calls `db.createObjectStore("active_workout_draft", { keyPath: "id" })`.

```ts
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
```

### Public API

```ts
export async function getActiveWorkoutDraft(): Promise<ActiveWorkoutDraft | undefined>
export async function saveActiveWorkoutDraft(draft: ActiveWorkoutDraft): Promise<void>
export async function clearActiveWorkoutDraft(): Promise<void>
```

All three are thin wrappers (`db.get`/`db.put`/`db.delete` on the `"current"` key), following the exact same pattern as every other CRUD function already in this file.

### `deleteTemplate` edge case

`deleteTemplate(id)` additionally checks `getActiveWorkoutDraft()`; if the draft's `templateId` matches the template being deleted, it also calls `clearActiveWorkoutDraft()` in the same operation, so no draft is left referencing a template that no longer exists.

---

## Subsystem B — `ActiveWorkout.tsx` Changes

### Resume on mount

The existing mount effect (which calls `getExercises(templateId)`) additionally calls `getActiveWorkoutDraft()`. If a draft exists and `draft.templateId === templateId`:
- Hydrate each fetched `Exercise`'s `logged` array from the matching entry in `draft.exercises` (by `exerciseId`).
- Set `startedAt.current = draft.startedAt` instead of leaving it at the `useRef(Date.now())` mount-time default.

If no draft exists, or it belongs to a different template (shouldn't normally happen here since `TemplateDetail`'s Start guard prevents entering a mismatched template — see Subsystem C — but handled defensively by simply not hydrating), behavior is unchanged from today (fresh empty `logged` arrays, `startedAt` = now).

### Elapsed time as a derived value

Currently `elapsed` is a `useState` counter incremented by 1 every second via `setInterval`, starting at 0 regardless of when the workout actually started. Change it to be computed each tick as `Math.floor((Date.now() - startedAt.current) / 1000)`, so:
- Resuming a draft immediately shows the correct real elapsed duration, not 0.
- The displayed time can't drift from wall-clock reality (e.g. if the tab was backgrounded and timers throttled).

### Persist on every logged set

In `handleLog`, after computing the updated `exercises` state, also call `saveActiveWorkoutDraft(...)` with the current full draft shape (`templateId`, `templateName`, `startedAt.current`, and each exercise's `id`/`logged`). This is a fire-and-forget write consistent with how other non-blocking UI updates in this codebase behave; a failure here doesn't need to interrupt logging a set, but should be caught and can set a lightweight, non-blocking error note (reusing the existing `loadError`/`finishError` visual convention) so silent failures aren't invisible if IndexedDB is unavailable.

### Clear draft on Finish

In `handleFinish`, after `saveWorkoutSession(built)` succeeds, call `clearActiveWorkoutDraft()` before transitioning to the `WorkoutSummary` view.

### Discard workout

New button, visible alongside Finish (e.g. a smaller/secondary action near the Finish button in the `TopBar`'s `right` slot, or directly below it — implementation detail for the plan to pin down, following the app's existing dense-header conventions). On click: `window.confirm("Discard this workout? Your logged sets will be lost.")` (matching the existing "Delete template" confirm pattern); on confirm, call `clearActiveWorkoutDraft()` and invoke a new `onDiscard: () => void` prop (wired by `App.tsx` to navigate back to `TemplateDetail`, same target as the existing Back button).

---

## Subsystem C — Blocking a Concurrent Workout

`TemplateDetail`'s `onStart` handler (the function passed to the Start `Button`'s `onClick`, currently just calling the `onStart` prop directly) becomes async: before calling the `onStart` prop, it calls `getActiveWorkoutDraft()`.
- If no draft exists, or the draft's `templateId` matches this template's id → proceed, call `onStart()` as today.
- If the draft exists for a **different** template → don't call `onStart()`. Instead surface an inline error (reusing `TemplateDetail`'s existing `actionError` state from the Phase 2b final-review fix) reading something like: `` `Finish or discard your ${draft.templateName} workout first.` ``

---

## Subsystem D — Navigation Resolution ("get back to it")

Both places that currently resolve "which screen/template should Workout-tab or initial app load land on" — the session-load effect and `handleNav`'s workout-tab branch in `App.tsx` — are updated to check `getActiveWorkoutDraft()` **before** falling back to `getLastUsedTemplateId()`:
- If a draft exists: `setActiveTemplateId(draft.templateId)`, `setScreen("workout")` directly — skip `TemplateDetail` entirely, landing straight back in the live in-progress `ActiveWorkout` screen.
- If no draft exists: fall back to today's `getLastUsedTemplateId()` → `TemplateDetail` quick-start behavior, unchanged.

This is the direct fix for the original complaint: from anywhere in the app, tapping the Workout tab always returns you to a live in-progress workout if one exists, instead of losing it.

---

## Out of Scope

- Multiple concurrent draft workouts (only one at a time, enforced by the block in Subsystem C).
- Syncing the draft across devices (Phase 3 territory — this is local IndexedDB only, consistent with the app's offline-first design).
- The pre-existing non-functional "+ Add exercise" button inside `ActiveWorkout` (adding exercises mid-workout) — unrelated dead UI, not touched by this fix.

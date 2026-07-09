# Exercise Library Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone "Exercise Library" screen that lists every exercise in the library (not scoped to any one template), and lets the user create, rename/re-categorize, and delete library exercises from one place.

**Architecture:** Two new files (`ExerciseEditForm` — a shared create/edit modal, and `ExercisesScreen` — the list screen) plus small wiring changes to `TemplatesScreen` (entry point button) and `App.tsx` (screen routing). No `src/lib/db.ts` changes are needed — `getExerciseLibrary`, `saveLibraryExercise` (upserts by `id`, so it already supports rename/re-categorize), and `deleteLibraryExercise` (already returns a `usedIn` conflict list) cover every operation this screen needs.

**Tech Stack:** React 18 + TypeScript 5 (strict) + Vite 6 + Tailwind + shadcn/ui + `lucide-react` icons. No test runner in this repo — verification is `npx tsc -b --noEmit` plus manual browser smoke testing, per existing project convention.

## Global Constraints

- No `src/lib/db.ts` changes — reuse `getExerciseLibrary()`, `saveLibraryExercise(exercise)`, `deleteLibraryExercise(id)` exactly as they exist today.
- Reuse the existing `.config-editor-overlay` / `.config-editor-panel` CSS classes (defined in `src/index.css`, already used by `ExerciseConfigEditor` and `ExercisePicker`) for the modal — do not introduce new overlay CSS.
- Entry point is a "Library" button on `TemplatesScreen`'s `TopBar` — do NOT add a new bottom-nav tab (explicitly decided against a 5th tab).
- Deleting a library exercise must go through `deleteLibraryExercise`'s existing conflict check (`{ok: false, usedIn: string[]}`) and surface that message — never bypass it.
- Match existing icon usage: use `lucide-react` icons (`Plus`, `X`), not emoji — the rest of the app has moved to `lucide-react` icons this session.
- Match existing error-message convention: `font-mono text-[11px] px-5 pt-1` paragraph, `color: hsl(var(--destructive))`.

---

### Task 1: `ExerciseEditForm` — shared create/edit modal

**Files:**
- Create: `src/components/ExerciseEditForm.tsx`

**Interfaces:**
- Produces: `ExerciseEditForm` component with props `{ title: string; initialName: string; initialMuscle: string; onSave: (name: string, muscle: string) => void; onCancel: () => void }`. `onSave` receives already-trimmed `name` and `muscle` (empty muscle defaults to `"Other"`, matching `ExercisePicker`'s existing create-flow default). Later tasks call this once for "create" (empty initial values) and once for "edit" (existing exercise's values).

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";

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

interface ExerciseEditFormProps {
  title: string;
  initialName: string;
  initialMuscle: string;
  onSave: (name: string, muscle: string) => void;
  onCancel: () => void;
}

export function ExerciseEditForm({
  title,
  initialName,
  initialMuscle,
  onSave,
  onCancel,
}: ExerciseEditFormProps) {
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState(initialMuscle);

  const canSave = name.trim().length > 0;

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-4">{title}</p>
        <div className="flex flex-col gap-2.5 mb-5">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Name</p>
            <input
              style={TEXT_INPUT_STYLE}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Muscle group</p>
            <input
              style={TEXT_INPUT_STYLE}
              placeholder="e.g. Chest"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!canSave}
            onClick={() => onSave(name.trim(), muscle.trim() || "Other")}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compile check**

Run: `npx tsc -b --noEmit`
Expected: no errors (this component isn't imported anywhere yet, so it only needs to type-check in isolation).

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseEditForm.tsx
git commit -m "feat: add shared create/edit modal for library exercises"
```

---

### Task 2: `ExercisesScreen` — the library list screen

**Files:**
- Create: `src/screens/ExercisesScreen.tsx`

**Interfaces:**
- Consumes: `ExerciseEditForm` from Task 1 (exact props above). `getExerciseLibrary(): Promise<LibraryExercise[]>`, `saveLibraryExercise(exercise: LibraryExercise): Promise<void>`, `deleteLibraryExercise(id: string): Promise<{ok: true} | {ok: false, usedIn: string[]}>`, and `type LibraryExercise = { id: string; name: string; muscle: string }` — all from `@/lib/db`, unchanged.
- Produces: `ExercisesScreen` component with props `{ onBack: () => void }`. Later task (Task 3) renders this from `App.tsx` and supplies `onBack`.

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { ExerciseEditForm } from "@/components/ExerciseEditForm";
import {
  getExerciseLibrary,
  saveLibraryExercise,
  deleteLibraryExercise,
  type LibraryExercise,
} from "@/lib/db";

interface ExercisesScreenProps {
  onBack: () => void;
}

export function ExercisesScreen({ onBack }: ExercisesScreenProps) {
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingExercise, setEditingExercise] = useState<LibraryExercise | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => getExerciseLibrary().then(setLibrary);

  useEffect(() => {
    reload();
  }, []);

  const handleCreate = async (name: string, muscle: string) => {
    setActionError(null);
    const exercise: LibraryExercise = { id: crypto.randomUUID(), name, muscle };
    try {
      await saveLibraryExercise(exercise);
      setCreating(false);
      reload();
    } catch {
      setActionError("Couldn't create exercise — try again.");
    }
  };

  const handleEditSave = async (name: string, muscle: string) => {
    if (!editingExercise) return;
    setActionError(null);
    try {
      await saveLibraryExercise({ ...editingExercise, name, muscle });
      setEditingExercise(null);
      reload();
    } catch {
      setActionError("Couldn't update exercise — try again.");
    }
  };

  const handleDelete = async (ex: LibraryExercise) => {
    if (!window.confirm(`Delete "${ex.name}"?`)) return;
    setActionError(null);
    try {
      const result = await deleteLibraryExercise(ex.id);
      if (result.ok) {
        reload();
      } else {
        setActionError(
          `"${ex.name}" is used in ${result.usedIn.join(", ")} — remove it from those templates first.`
        );
      }
    } catch {
      setActionError("Couldn't delete exercise — try again.");
    }
  };

  return (
    <div>
      <TopBar
        title="Exercise Library"
        onBack={onBack}
        right={
          <button
            onClick={() => setCreating(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--primary))",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Add exercise"
          >
            <Plus size={20} strokeWidth={2} />
          </button>
        }
      />

      {actionError && (
        <p
          className="font-mono text-[11px] px-5 pt-1"
          style={{ color: "hsl(var(--destructive))", margin: 0 }}
        >
          {actionError}
        </p>
      )}

      <div className="px-5 pt-4 pb-24 flex flex-col gap-2.5">
        {library.length === 0 ? (
          <div className="pt-10 text-center">
            <p className="text-muted-foreground text-sm">No exercises yet — tap + to add one</p>
          </div>
        ) : (
          library.map((ex) => (
            <Card key={ex.id} onClick={() => setEditingExercise(ex)} className="cursor-pointer">
              <CardContent
                style={{ padding: "14px 16px" }}
                className="flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[15px]">{ex.name}</p>
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
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(ex);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "hsl(var(--destructive))",
                    padding: "2px 4px",
                    display: "flex",
                  }}
                  aria-label={`Delete ${ex.name}`}
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {creating && (
        <ExerciseEditForm
          title="New exercise"
          initialName=""
          initialMuscle=""
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingExercise && (
        <ExerciseEditForm
          title="Edit exercise"
          initialName={editingExercise.name}
          initialMuscle={editingExercise.muscle}
          onSave={handleEditSave}
          onCancel={() => setEditingExercise(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Compile check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/ExercisesScreen.tsx
git commit -m "feat: add ExercisesScreen for standalone library management"
```

---

### Task 3: Wire up navigation — `TemplatesScreen` entry button + `App.tsx` routing

**Files:**
- Modify: `src/screens/TemplatesScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ExercisesScreen` from Task 2 (props `{ onBack: () => void }`).
- Produces: `TemplatesScreen` gains a new required prop `onOpenLibrary: () => void`; `App.tsx`'s `AppScreen` union gains `"exercises"`.

- [ ] **Step 1: Add the `onOpenLibrary` prop and "Library" button to `TemplatesScreen`**

In `src/screens/TemplatesScreen.tsx`, change the props interface:

```tsx
interface TemplatesScreenProps {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (id: string) => void;
  onOpenLibrary: () => void;
}
```

Change the function signature:

```tsx
export function TemplatesScreen({
  onSelectTemplate,
  onCreateTemplate,
  onOpenLibrary,
}: TemplatesScreenProps) {
```

Replace the existing `<TopBar title="Templates" />` line with:

```tsx
      <TopBar
        title="Templates"
        right={
          <button
            onClick={onOpenLibrary}
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
            Library
          </button>
        }
      />
```

- [ ] **Step 2: Compile check (expect a failure — this is expected and diagnostic)**

Run: `npx tsc -b --noEmit`
Expected: FAIL — `src/App.tsx` renders `<TemplatesScreen>` without the new required `onOpenLibrary` prop. This confirms the prop is correctly required; Step 3 fixes it.

- [ ] **Step 3: Wire routing in `App.tsx`**

Add the import (alongside the other screen imports):

```tsx
import { ExercisesScreen } from "@/screens/ExercisesScreen";
```

Change the `AppScreen` union:

```tsx
type AppScreen = "templates" | "template" | "workout" | "history" | "profile" | "exercises";
```

Add `onOpenLibrary` to the existing `<TemplatesScreen>` render:

```tsx
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
            onOpenLibrary={() => setScreen("exercises")}
          />
        )}
```

Add a new render branch (placed after the `"profile"` branch, before the closing `</div>` of `.scroll-area`):

```tsx
        {screen === "exercises" && (
          <ExercisesScreen onBack={() => setScreen("templates")} />
        )}
```

- [ ] **Step 4: Compile check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser smoke test**

With the dev server running (`npm run dev`):
1. Sign in, land on Templates screen. Confirm a "Library" text button now appears in the top-right of the top bar.
2. Tap "Library" — confirm the Exercises screen opens, listing every exercise currently in the library (from existing templates), each showing name + muscle badge.
3. Tap the `+` icon in the top bar — confirm the create modal opens; enter a name and muscle group, tap Save — confirm the new exercise appears in the list.
4. Tap an existing exercise row — confirm the edit modal opens pre-filled with its current name/muscle; change the muscle group, tap Save — confirm the row updates.
5. Tap the × on an exercise that IS used in a template — confirm the confirmation dialog appears, and after confirming, the error message names which template(s) it's used in and the exercise is NOT deleted.
6. Tap the × on an exercise that is NOT used in any template (e.g. the one just created) — confirm it deletes after the confirmation dialog.
7. Tap the back arrow — confirm it returns to the Templates screen.

- [ ] **Step 6: Commit**

```bash
git add src/screens/TemplatesScreen.tsx src/App.tsx
git commit -m "feat: wire Exercise Library screen into navigation"
```

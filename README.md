# Peak

Offline-first workout tracker PWA. Build and log workout templates, track history and per-exercise progression, all stored locally with passwordless Supabase auth gating access.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

Requires a `.env.local` with your Supabase project credentials:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Tech overview

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript 5 (strict) + Vite 6 |
| Styling | Tailwind CSS + shadcn/ui primitives (self-contained copies in `src/components/ui/`) |
| Icons | `lucide-react` |
| Local data | IndexedDB via the `idb` library — the app's actual source of truth |
| Auth | Supabase Auth, passwordless magic-link (`signInWithOtp`, `shouldCreateUser: false`) |
| Account gating | A hand-reviewed `account_requests` table — new users request access (name + email), an admin manually creates their Supabase user to approve |
| PWA | `public/manifest.json` + `public/sw.js` (cache-first service worker, precaches the app shell) |
| Testing | No test runner — verification is `npx tsc -b --noEmit` plus manual browser testing |

**Data model**: everything (templates, exercise library, workout sessions, the in-progress workout draft) lives in local IndexedDB, managed entirely through `src/lib/db.ts` — no other file talks to IndexedDB directly. Supabase is currently used *only* for auth and account requests; there is no cross-device data sync yet (see `docs/superpowers/specs/2026-07-09-supabase-sync-design.md` for the planned design).

**Why passwordless**: no password field anywhere in the app. Sign-in is a magic link sent to your email; new accounts aren't self-serve — they go through the request-and-manual-approval flow above.

---

## Project structure

```
src/
  lib/
    db.ts              ← IndexedDB — the single source of truth for all app data
    data.ts             ← Runtime types (Exercise, TimerState), fmtTime util
    seedProgram.ts      ← The seeded 5-day Push/Pull/Legs training program + its notes (see below)
    muscles.ts          ← Static muscle-group taxonomy + fuzzy search for the muscle picker
    weightUnit.tsx       ← kg/lb display-preference context (conversion is display-only; storage stays kg)
    supabase.ts          ← Supabase client
    utils.ts             ← cn() helper, date formatting

  components/
    ui/                  ← shadcn primitives (Button, Card, Badge, Progress, Separator)
    TopBar.tsx            ← Sticky header, title uses the branded stencil display font
    NavBar.tsx            ← Fixed bottom nav (Templates, Exercises, Workout, History, Profile)
    ExerciseCard.tsx       ← Exercise card during an active workout (log form, rest timer, set list)
    ExerciseConfigEditor.tsx ← Sets/reps/weight/rest editor, used by template editing and mid-workout adds
    ExercisePicker.tsx      ← Library search/create picker, used by template editing and mid-workout adds
    ExerciseEditForm.tsx    ← Create/rename/notes form for the standalone Exercise Library screen
    NotesBlock.tsx           ← Read-only display for template and exercise notes
    MuscleSelect.tsx         ← Fuzzy-searchable muscle-group combobox
    ConfirmDialog.tsx         ← Shared styled confirmation modal (replaces window.confirm everywhere)
    TimerSheet.tsx             ← Draggable rest-timer bottom sheet
    HistoryAnalytics.tsx        ← Per-exercise progression chart (date range, peak/volume metric, trend)

  screens/
    AuthScreen.tsx         ← Magic-link sign-in + account-request form
    TemplatesScreen.tsx     ← Template list, muscle-group badges per template
    TemplateDetail.tsx       ← One template: exercise list, edit mode, rename/delete
    WorkoutHomeScreen.tsx     ← Landing state on the Workout tab when nothing is in progress
    ActiveWorkout.tsx          ← In-progress workout: logging, rest timer, mid-workout add-exercise
    WorkoutSummary.tsx          ← Post-workout recap (volume, PRs)
    HistoryScreen.tsx            ← Workout history list + embeds HistoryAnalytics
    ExerciseHistoryScreen.tsx     ← Single-exercise focused view of HistoryAnalytics
    ExercisesScreen.tsx            ← Standalone exercise library management (search, group, edit, delete)
    ProfileScreen.tsx                ← Account email, weight-unit toggle, sign out

  App.tsx                ← Screen routing state machine, session bootstrap
  main.tsx                ← Entry point, service worker registration
  index.css                ← Tailwind + shadcn tokens + custom scrollbar + design overrides
```

---

## Design tokens

All color decisions live in `src/index.css` as CSS custom properties:

```css
--primary: 72 100% 64%;       /* Electric lime — the one accent color */
--destructive: 4 90% 58%;     /* Red — delete/error actions only */
--background: 0 0% 6%;        /* Near-black */
--card: 0 0% 10%;
--border: 0 0% 16%;
--muted-foreground: 0 0% 40%;
```

The palette is intentionally minimal: lime for primary/active/positive states, red for destructive actions, everything else neutral gray. Muscle-group badges and other categorical labels use neutral styling rather than their own accent colors, to keep cognitive load low on the active-workout screen in particular.

Page-level titles use a branded stencil display font (`font-title` → "Allerta Stencil", see `tailwind.config.js`), applied via the shared `TopBar` component so every screen picks it up automatically.

---

## Key behaviors worth knowing

- **Deferred template sync from a workout.** Changing an exercise's rest time, logging more/fewer sets than planned, or adding a new exercise mid-workout only updates the *session* live — the parent template is only updated when you tap Finish, and only from data in the completed session. Discarding or abandoning a workout never touches the template.
- **Active workout draft persistence.** An in-progress workout is saved to IndexedDB after every logged set, so navigating away and back (or losing the tab) resumes exactly where you left off. Starting a second workout while one is already in progress is blocked with an explicit message.
- **Notes on templates and exercises.** Both carry optional free-text notes.
  A template's notes describe the session (focus, bias, how to run it) and are
  edited in its Edit mode; an exercise's notes are form cues and progression
  rules, edited in the Exercise Library and shown wherever that exercise
  appears — on the template's exercise cards, and during a workout on the
  *active* card only, so a collapsed list stays scannable. Both sync like any
  other field (`notes` columns, migration 006).
- **Seeded training program.** Every device is seeded once with the 5-day
  Push/Pull/Legs split (Push A / Pull A / Legs / Push B / Pull B) and its 31
  exercises, defined in `src/lib/seedProgram.ts` and applied by
  `ensureProgramSeed()` in `src/lib/db.ts`. Sets, rep ranges and rest come from
  the program; loads seed at 0 kg since those are personal. Seeded templates
  append after any templates you already have, and a `sync_meta` marker keyed
  by the seed version means editing or deleting one sticks. Bumping that
  version re-runs the seed once, which only fills in fields that are still
  empty (that is how v1 devices picked up the notes added in v2) and never
  overwrites what you have changed. Because seeded ids are deterministic, the same program pushed up
  by sync (or inserted directly via
  `supabase/migrations/007_seed_training_program.sql`) converges on the same
  rows rather than duplicating. Those fixed ids can only be used by one
  account, though: `templates.id` and `exercise_library.id` are global primary
  keys, so a second account needs a different id prefix.
- **Weight unit is display-only.** All weights are stored in kg internally; the kg/lb toggle in Profile only affects formatting and what unit new input fields interpret, never what's persisted.

---

## Testing

No automated test suite. Before considering a change done:

```bash
npx tsc -b --noEmit
```

then manually exercise the affected flow in the browser (`npm run dev`).

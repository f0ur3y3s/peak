# Handoff — Peak redesign, `redesign/phased` branch

Written 2026-08-20 for a fresh Claude Code session picking this up. The previous
session ended abruptly (user had to go) with the working tree clean and
everything committed — there is no in-flight/uncommitted work to recover.

## What this branch is

A full UI review + implementation pass on **Peak**, a mobile-first workout-tracker
PWA (React + Tailwind + shadcn-style components, dark theme, lime/chartreuse
accent). Branch `redesign/phased` off `restart`. Sequence so far:

1. A code-grounded UI audit (published as an Artifact, not in this repo) covering
   every screen/component, organized into phases: P0 (correctness/broken CSS,
   contrast, modal a11y, drag-reorder alternative), P1 (color system, typography,
   empty states, icon sizes), P2 (Workout Home dashboard rebuild, breadcrumb fix,
   elevation decision).
2. `/impeccable audit` + `/impeccable critique` (dual sub-agent design review +
   detector/browser evidence) run against the resulting app — see
   `.impeccable/critique/2026-08-20T18-43-30Z__localhost.md` for the full
   persisted critique (score: 31/40).
3. Working through both reports' combined recommended actions, phase by phase,
   each phase: implemented → verified with `tsc -b` + `vite build` → verified
   **live in-browser** (this matters, see below) → code-reviewed via the
   `code-review` skill (medium effort) as a background fork → issues found by
   review fixed → committed.

## How to actually see the app running

The app is normally gated behind Supabase auth. For local dev without a real
Supabase project:

- `.env` (gitignored, not committed) needs:
  ```
  VITE_SUPABASE_URL=https://placeholder.supabase.co
  VITE_SUPABASE_ANON_KEY=placeholder-anon-key
  VITE_LOCAL_PREVIEW=1
  ```
- `VITE_LOCAL_PREVIEW=1` triggers `LOCAL_PREVIEW` in `src/App.tsx`, which skips
  `AuthScreen` in dev builds only (`import.meta.env.DEV` gated — zero effect on
  prod). All real data (templates, exercises, sessions, history) lives in
  IndexedDB via `src/lib/db.ts` — only auth and cross-device sync need Supabase.
- **Vite only reads `.env` at server startup** — if you change it, restart
  `npm run dev`, don't rely on HMR.
- A fresh IndexedDB seeds itself with a "Push Day A" template (Bench Press /
  Incline DB Press / Tricep Pushdown) automatically (see `lib/db.ts`'s
  `upgrade()` — seeds on `oldVersion < 2` && not a v1 migration).
- There was a stray "fdsa" template (0 exercises) in the local test data from
  earlier manual poking — harmless, local-only, not code; delete it via the UI
  if it bothers you, or ignore it.

**Known environment quirk from this session:** another concurrent Claude Code
session (or the user, in another window) was actively running its own
`npm run dev` and editing this same repo/browser profile during parts of this
work. Its edits and this session's converged cleanly (verified via `git diff`
after each notification), but check `git log`/`git status` for anything
unexpected before assuming a clean baseline. Also, the shared browser tab's
viewport size drifted unpredictably across screenshots (851px vs 878px wide)
during live verification — not a bug in the app, just automation-environment
noise; `resize_window` to a true phone size did not reliably take effect
either.

## Commits on this branch (oldest → newest)

```
218fc5e fix(P0): restore broken exercise-card state, fix contrast, add a11y to modals + drag reorder
b93d28b feat(P1): split achievement color from action color, de-emphasize stencil face, unify empty states, tokenize icon sizes
3eb4e64 feat(P2): dashboard-ify Workout Home, fix breadcrumb refetch, commit to a flat card system
0da9171 chore: allow running locally without a Supabase project
0baa570 fix: complete the P1 achievement-color split on ExerciseCard's set counter   (bug caught live, not by review)
0122605 fix(a11y): add form labels/focus indicators, semantic headings, and a live region for the rest timer
803b5d4 chore: persist impeccable audit+critique snapshot
5b03844 chore: don't track impeccable's transient live-server state
e098cc9 fix: surface Finish's silent template mutation, fix Discard's copy mismatch
8793d1f fix(a11y): raise touch targets — Button default height, stepper buttons, reorder chevrons
e854699 perf: bound WorkoutHomeScreen's session query, document why the other 4 stay unbounded
977a1ee feat: add a workout-in-progress indicator to the nav bar   (*)
```

(*) `977a1ee` is the **only commit not run through the `code-review` skill** —
the user asked to wrap up before that pass could run. It was verified with
`tsc -b` and thorough live in-browser testing (including an edge case fixed
mid-session — see the commit message), but hasn't had a second-pair-of-eyes
review pass like every other commit here. **Recommend running
`/code-review` (medium effort, or just review `App.tsx`/`NavBar.tsx`'s diff
in that commit) before considering this branch fully done.**

## What's done vs. what's left

From the code-level Audit's 6 recommended actions:
- [x] P1 harden — input focus indicators + form label associations
- [x] P2 harden — semantic headings (TopBar/modals → h1/h2)
- [x] P2 adapt — Button default height 40px→44px
- [x] P2 optimize — bound `getWorkoutSessions()` (only where safe — see `e854699`'s message for why 4 of 5 call sites were deliberately left unbounded)
- [ ] **P2 polish — replace two raw hex/hsl values with named tokens**: `index.css`'s `.set-chip { color: hsl(72 80% 55%) }` and `.timer-sheet-inner { background: hsl(0 0% 8%) }` still bypass the token system. Not started.
- [ ] **P3 typeset — migrate arbitrary `text-[Npx]` utilities to a rem-based scale**: pervasive (nearly every screen). Not started — this is the broadest, lowest-priority remaining item; consider scoping it down (e.g. add custom rem-equivalent Tailwind size tokens for 10px/11px/13px rather than a wholesale sweep) rather than touching every occurrence.

From the `/impeccable critique`'s 6 priority issues:
- [x] P1 — rest-timer `aria-live` region
- [x] P1 — Finish/Discard confirmation asymmetry + copy mismatch
- [x] P2 — workout-in-progress nav indicator (needs the review pass noted above)
- [x] P2 — reorder chevron touch-target size
- [ ] **P3 — muscle-group picker listbox shows only ~1.5 of 18 options before scrolling**. `src/components/MuscleSelect.tsx`'s dropdown (`maxHeight: 220` in the inline style around line 50) is too short. Not started — straightforward, just bump the max-height (or restructure as a taller sheet) so ~5-6 rows are visible before scroll kicks in.

## Recommended next steps, in order

1. Run `/code-review` over `977a1ee` (nav indicator) to close that gap.
2. `MuscleSelect` listbox height (P3, quick, isolated).
3. `.set-chip`/`.timer-sheet-inner` token cleanup (P2, quick, isolated, in `index.css`).
4. Decide scope for the rem-based text-scale migration (P3) — this is the one
   item worth a deliberate scoping conversation rather than just diving in,
   given its breadth.
5. After all of the above, consider re-running `/impeccable audit` and
   `/impeccable critique` to confirm the scores actually moved, per the
   skill's own suggested closing step.

## Verification pattern used throughout (keep using it)

For each phase: implement → `npx tsc -b` → `npx vite build` (then `rm -rf dist`,
it's gitignored) → live-verify in the browser via the `mcp__claude-in-chrome__*`
tools against `http://localhost:5173` (load them first via `ToolSearch` if
deferred) → `Skill(code-review, args: "medium")` as a background fork → fix
what it finds → commit. This caught real bugs three separate times this
session (an inert CSS-cascade fix, a template-update race with a failed save,
a missing rest-duration entry) that would not have been caught by type-checking
or code reading alone — worth keeping as the standard for the rest of this
work.

# Handoff — Peak redesign, `redesign/phased` branch

Updated 2026-08-24. Superseded almost entirely since the 2026-08-20 version of
this file — a second Claude Code session picked it up, finished everything
listed as remaining, ran a *second* full `/impeccable` audit+critique cycle
against its own work, and fixed everything that surfaced there too. This
version reflects the branch as it stands now: **clean and ready for a PR into
`restart`**, not mid-work.

If you're a fresh session reading this: read `SETUP.md` first for how to get
a working environment, then come back here.

## Status: ready for review, not more audit rounds

`tsc -b` and `vite build` both pass clean at HEAD (verified 2026-08-24). Working
tree clean, nothing uncommitted. 27 commits ahead of `restart`.

Two full audit→fix cycles have now run against this app:

1. **2026-08-20**: code-level manual audit (P0/P1/P2 phases) + first
   `/impeccable audit`+`critique` (scored 31/40) → fixed.
2. **2026-08-21**: second `/impeccable critique` run fresh against the result
   (scored 25/40 — see `.impeccable/critique/2026-08-21T02-47-10Z__localhost.md`,
   its own "Reading the score drop" section explains why a lower score on a
   fresh pass isn't a regression) → all 5 priority issues it found were fixed,
   plus an additional QA sweep caught a few more bugs (History chart
   trend/axis math, a stale error banner, parallelized DB reads).

**Recommendation: don't kick off a third open-ended critique round.** Every
fresh pass will keep finding *something* — that's inherent to the method, not
a sign the app is still broken. At this point the marginal value is in human
review and shipping, not another automated pass. If you do want one more
targeted check, make it human-directed (a specific screen or flow someone
actually flagged), not another blind `/impeccable critique`.

One thing I (this session) personally verified live and can vouch for: the
second critique's report flagged an **unconfirmed** anomaly — a set appearing
already-logged (`1/10 sets`) immediately after tapping Start, which
Assessment B itself couldn't reproduce and called possibly an environment
artifact. I re-checked it fresh (clean reload, fresh workout start) on
2026-08-24 and it does not reproduce — `0/N sets` on every exercise
immediately after Start, every time. Treat it as noise, not a bug.

## What's actually in this branch (all done)

**From the first pass (P0/P1/P2 manual audit + first `/impeccable` cycle):**
- Restored dead `.card-active`/`.card-complete` CSS (the active-workout
  screen's core state indicator was silently broken)
- Fixed `--muted-foreground` contrast (~3.3:1 → ~6.3:1)
- Shared accessible `Modal` primitive (focus trap, Escape, stacking) used by
  all dialogs
- Drag-reorder gets a button-based non-pointer alternative (WCAG 2.5.7)
- Split `--success` (achievement) from `--primary` (action) — PR badges,
  "all sets complete," etc.
- Stencil display font reserved for hero moments only; TopBar/modal titles
  are real headings now
- Shared `EmptyState` component
- Workout Home rebuilt from one sentence into a real dashboard
  (quick-start + last-session recap)
- Form labels + focus indicators added everywhere they were missing
- `aria-live` region on the rest timer
- Finish's silent template mutation now surfaces on the Summary screen
  ("Template Updated"); Discard's confirm button says "Discard" not "Delete"
- Touch targets raised to 44px (Button default, steppers, reorder chevrons)
- Nav-bar dot indicating a workout is in progress
- Local dev without Supabase (`VITE_LOCAL_PREVIEW=1` — see `SETUP.md`)

**From the second pass (fresh `/impeccable critique` + fixes):**
- Muscle-group listbox scrolls itself instead of the whole modal
- `.set-chip`/`.timer-sheet-inner` routed through named tokens
- Arbitrary `text-[Npx]` values migrated to a named rem-based type scale
- Edit Template's exercise-delete now confirms (was the one delete in the
  app with no confirmation — trained-then-punished users used to the
  confirm-gated pattern elsewhere)
- Workout Complete gives a PR session real visual presence (was previously
  identical whether or not a PR happened, despite being the app's peak
  retention moment)
- Delete-from-library affordance removed from the Add-Exercise picker
  (task-context bleed — deleting from the global library doesn't belong in
  an "add to this template" flow)
- "Start" becomes "Resume" (with elapsed time) when a draft already exists
  for that template
- Reorder controls (drag handle + chevrons) hidden on TemplatesScreen when
  there's only one template — dead weight competing for thumb space
- Pinch-zoom re-enabled, global focus ring added, rest-time stepper labeled
- Reorder-chevron touch targets grown further, spacing added between them
- `.field-input` placeholder color routed through a theme token
- Per-exercise DB reads parallelized (was sequential)
- History chart trend-line/axis math bugs fixed
- Stale action-error banner now clears when starting a new library action

## Recommended next steps

1. **Open a PR from `redesign/phased` into `restart`** and get human eyes on
   it — this is the actual next step, not more automated passes.
2. If a human reviewer flags something specific, fix that directly rather
   than re-running a full critique.
3. After merge, delete this file and `SETUP.md` (or fold the still-useful
   parts — the `.env`/`VITE_LOCAL_PREVIEW` setup — into a real README) so
   they don't linger as stale docs the way the first version of this file
   briefly did.

## Verification pattern used throughout (worth keeping for future work)

For each change: implement → `npx tsc -b` → `npx vite build` (then `rm -rf
dist`, gitignored) → live-verify in the browser via `mcp__claude-in-chrome__*`
against `http://localhost:5173` → `Skill(code-review, args: "medium")` as a
background fork → fix what it finds → commit. This caught several real bugs
across both sessions that type-checking alone would have missed.

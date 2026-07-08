# GymApp UI — Claude Code Starter

Workout tracker UI built with React + TypeScript + Vite + Tailwind + shadcn/ui.

This is the **UI prototype** for the gym app described in the implementation guide. It covers the three core workout screens with full interactivity. Wire it up to IndexedDB and Supabase following the implementation guide phases.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## What's included

### Screens
- **Template Detail** — Shows exercise list with targets, last session sets, rest timer duration. Tap **Start** to begin workout.
- **Active Workout** — Exercise cards with tap-to-expand log form, set stepper inputs, previous session chips, progress tracking, rest timer.
- **History** — Expandable workout cards with full set breakdown, PR badges, volume stats.

### Key component: TimerSheet
Draggable bottom sheet timer. After logging a set the timer auto-opens full screen.

- **Drag handle down** past ~80px → collapses to a compact pill above the nav bar, still counting down
- **Tap pill** → expands back to full sheet
- **× button on pill** → dismisses
- **+30s / −30s** adjust on the fly
- Turns red in final 10 seconds
- Accent bar pulses at bottom when done

---

## Project structure

```
src/
  lib/
    utils.ts          ← cn() helper
    data.ts           ← Types, seed data, fmtTime util
  components/
    ui/
      button.tsx      ← shadcn Button
      card.tsx        ← shadcn Card
      badge.tsx       ← shadcn Badge
      progress.tsx    ← shadcn Progress
      separator.tsx   ← shadcn Separator
    TopBar.tsx        ← Sticky header with back button
    NavBar.tsx        ← Fixed bottom nav
    TimerSheet.tsx    ← Draggable rest timer sheet
    ExerciseCard.tsx  ← Exercise card with log form
  screens/
    TemplateDetail.tsx  ← Template overview screen
    ActiveWorkout.tsx   ← In-workout screen
    HistoryScreen.tsx   ← Workout history
  App.tsx             ← Root with screen/nav state
  main.tsx            ← Entry point
  index.css           ← Tailwind + shadcn tokens + gym overrides
```

---

## Design tokens

All colour decisions live in `src/index.css` as CSS custom properties:

```css
--primary: 72 100% 64%;   /* Electric lime #E8FF47 — the single accent */
--background: 0 0% 6%;    /* Near-black #0F0F0F */
--card: 0 0% 10%;          /* Surface #1A1A1A */
--border: 0 0% 16%;        /* #292929 */
--muted-foreground: 0 0% 40%; /* #666 */
```

To adjust the accent colour, change `--primary` and `--accent` together.

---

## Next steps (from implementation guide)

1. **Phase 1** — Add service worker (`sw.js`), `manifest.json`, Supabase auth
2. **Phase 2** — Wire all state to IndexedDB via `idb` library instead of seed data
3. **Phase 3** — Add sync engine (`src/lib/sync/`)
4. **Phase 4** — Deploy to Vercel

### Replacing seed data

All mock data lives in `src/lib/data.ts` as `SEED_EXERCISES` and `SEED_HISTORY`. Replace these with IndexedDB reads once Phase 1 local DB is set up.

The `Exercise` and `WorkoutRecord` TypeScript types in `data.ts` match the IndexedDB schema defined in the implementation guide exactly.

---

## shadcn components used

| Component | Source |
|-----------|--------|
| Button    | `src/components/ui/button.tsx` |
| Card      | `src/components/ui/card.tsx` |
| Badge     | `src/components/ui/badge.tsx` |
| Progress  | `src/components/ui/progress.tsx` |
| Separator | `src/components/ui/separator.tsx` |

These are self-contained copies (no CLI needed). To add more shadcn components, run:

```bash
npx shadcn@latest add <component>
```

Make sure `components.json` is configured to use the `@/` alias pointing to `./src`.

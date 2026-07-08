# Phase 2d Design — Wire HistoryAnalytics to Real Data

**Date:** 2026-07-08
**Scope:** Replace `HistoryAnalytics`'s fully synthetic data generation with real `WorkoutSession` data, and restyle its UI onto the app's existing shadcn/design-token system.

---

## Decisions

| Question | Decision |
|---|---|
| Exercise pill list | Only exercises with ≥1 logged session (derived from real data, not the library) |
| Data fetching | `HistoryAnalytics` fetches its own `getWorkoutSessions()` independently (no prop coupling with `HistoryScreen`) |
| Grouping logic location | Pure function `groupSessionsByExercise` in `src/lib/db.ts`, alongside `sessionVolume`/`sessionSetCount` |
| "All" date range | Genuinely unlimited (no day cutoff) — the current 730-day hardcoded ceiling is removed |
| Date range UI | Keep the existing preset pills (1M/3M/6M/1Y/All) — no custom from/to date picker |
| Empty state (zero sessions ever) | Whole panel replaced with a centered message: "Log a workout to see your progress" |
| Empty state (exercise selected, no data in range) | Unchanged — existing in-chart "No data for this range" message |
| Visual system | Restyle onto shadcn `Card`/`Button` + the app's `hsl(var(--...))` CSS custom properties; the SVG chart itself stays custom-drawn but references the same color tokens |

---

## Subsystem A — Data Layer (`src/lib/db.ts` additions)

```ts
export interface ExerciseHistoryPoint {
  t: number;    // session startedAt (ms timestamp)
  peak: number; // max weight logged for this exercise in that session
  vol: number;  // sum(reps × weight) for this exercise in that session
}

export function groupSessionsByExercise(
  sessions: WorkoutSession[]
): Record<string, ExerciseHistoryPoint[]>
```

Pure, synchronous, no IndexedDB access of its own — operates on an already-fetched `WorkoutSession[]`. For each session, for each `exercises[]` entry present in that session, compute:
- `peak = Math.max(...sets.map(s => s.weight))`
- `vol = sets.reduce((sum, s) => sum + s.reps * s.weight, 0)`

Group by exercise `name` into the returned record; each exercise's array sorted ascending by `t`. A session with no entry for a given exercise contributes nothing to that exercise's array (no zero-filling).

This function is exported directly from `db.ts` — no new IndexedDB store or version bump needed, since it only operates on data already returned by the existing `getWorkoutSessions()`.

---

## Subsystem B — `HistoryAnalytics.tsx` Data Wiring

- Remove: `RAW`, `genData`, `randNorm`, `EXERCISES` (hardcoded), and the `ago`/`NOW`/`MS_DAY` fake-data helpers used only for synthetic generation (`MS_DAY` itself stays, since real date-range filtering still needs it).
- Add: `const [sessions, setSessions] = useState<WorkoutSession[] | null>(null)` — `null` = still loading. `useEffect` on mount calls `getWorkoutSessions().then(setSessions)`.
- Derive `grouped = useMemo(() => sessions ? groupSessionsByExercise(sessions) : {}, [sessions])`.
- Derive `EXERCISES = Object.keys(grouped)` (replaces the hardcoded array). `selEx` state initializes to `EXERCISES[0]` once `sessions` finishes loading (via a `useEffect` that sets `selEx` the first time `EXERCISES` becomes non-empty, since it's not known at initial render).
- `DataPoint` interface renamed/aliased to reuse `ExerciseHistoryPoint` from `db.ts` (import it instead of declaring a local duplicate).

### Loading state

While `sessions === null`, render a lightweight loading placeholder (reuse the same visual treatment as elsewhere in the app for async loads — a simple centered `"Loading…"` text in muted color; no spinner component exists in this codebase and none is needed for a sub-second local IndexedDB read).

### Empty state (zero sessions)

Once loaded, if `EXERCISES.length === 0`, render only:
```tsx
<Card>
  <CardContent className="py-10 text-center">
    <p className="text-muted-foreground text-sm">Log a workout to see your progress</p>
  </CardContent>
</Card>
```
No pills, chart, or stat cards.

### Date range — "All" becomes unlimited

```ts
const DATE_RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },  // null = no cutoff
];
```
Filtering: `const pts = (grouped[selEx] ?? []).filter(p => selRange.days === null || p.t >= NOW - selRange.days * MS_DAY);`

---

## Subsystem C — Visual Restyle

### Pills (exercise selector + date range)

Replace the custom `Pill` function component (raw `<button>` with inline `style`) with shadcn `Button`:
```tsx
<Button
  key={ex}
  variant={selEx === ex ? "default" : "outline"}
  size="sm"
  className="font-mono text-[11px] rounded-full"
  onClick={() => setSelEx(ex)}
>
  {ex}
</Button>
```
Same structural usage for date-range pills.

### Metric toggle

Replace the custom two-`<button>` segmented control with two `Button`s in a bordered flex wrapper:
```tsx
<div className="flex border border-border rounded-lg overflow-hidden">
  {(["weight", "volume"] as Metric[]).map((m) => (
    <Button
      key={m}
      variant={metric === m ? "secondary" : "ghost"}
      className="flex-1 rounded-none font-mono text-[11px]"
      onClick={() => setMetric(m)}
    >
      {m === "weight" ? "Peak weight (kg)" : "Total volume (kg)"}
    </Button>
  ))}
</div>
```

### Stat cards

Replace the custom `<div>` grid with shadcn `Card`/`CardContent`, matching `TemplateDetail`'s existing stats-card markup pattern (`grid grid-cols-3 gap-2`, each cell a `Card` with `CardContent` padding `"10px 12px"`).

### Color tokens

Replace the hardcoded `C` palette object's usages throughout (chart SVG, tooltip, legend) with the app's real tokens:

| Old (`C.*`) | New |
|---|---|
| `C.bg` | `hsl(var(--background))` |
| `C.surface` / `C.surface2` | `hsl(var(--card))` |
| `C.border` / `C.grid` | `hsl(var(--border))` |
| `C.accent` / `C.accentLo` | `hsl(var(--primary))` (at full and reduced opacity via `/ 0.x`) |
| `C.muted` / `C.text2` | `hsl(var(--muted-foreground))` |
| `C.text` | `hsl(var(--foreground))` |
| `C.green` | `hsl(142 70% 45%)` (existing "done"/PR success color, reused verbatim from `ExerciseCard`/`WorkoutSummary`) |
| `C.red` | `hsl(var(--destructive))` |

The `C` object itself is removed; the `mono`/`sans` font-family constants stay (no equivalent Tailwind utility maps as directly to `'DM Mono', 'Courier New', monospace"` in this codebase's existing usage, so keep as-is, consistent with how `font-mono`-classed elements elsewhere still sometimes carry an inline `fontFamily` override).

### What stays untouched

- `Chart` component's coordinate math, `linReg`, `fmtDate`/`fmtShortDate`, tooltip positioning logic, `ResizeObserver` sizing — all unchanged, purely visual/data-shape-agnostic.
- The scatter-plot + dashed regression line rendering approach (custom SVG) — no shadcn equivalent exists or is warranted here.

---

## Out of Scope

- A dedicated exercise-history data-layer function that queries IndexedDB directly per-exercise (the plan fetches all sessions once and groups client-side, consistent with the "HistoryAnalytics fetches independently" decision and this app's current data volumes).
- Any change to `HistoryScreen.tsx`'s own `getWorkoutSessions()` call or the workout list below the analytics panel.
- Supabase sync (Phase 3).

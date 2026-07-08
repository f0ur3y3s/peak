# Phase 2d: Wire HistoryAnalytics to Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `HistoryAnalytics`'s fully synthetic, hardcoded data generation with real `WorkoutSession` data, and restyle its UI onto the app's existing shadcn/design-token system instead of a bespoke hardcoded color palette.

**Architecture:** A new pure function `groupSessionsByExercise` in `src/lib/db.ts` turns already-fetched `WorkoutSession[]` into per-exercise-name arrays of `{ t, peak, vol }` points — the same shape `HistoryAnalytics`'s chart math already expects. `HistoryAnalytics` fetches sessions once on mount, derives its exercise pill list from real data (only exercises with logged history), and renders using shadcn `Card`/`Button` and the app's `hsl(var(--...))` CSS custom properties instead of a hardcoded hex palette. The hand-drawn SVG scatter chart and its regression-line math are untouched — only their color inputs change.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 6, Tailwind, shadcn/ui components already in the repo.

## Global Constraints

- TypeScript strict mode: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` (from `tsconfig.app.json`) — every changed file must satisfy these with zero errors.
- No test runner is configured in this repo (no vitest/jest). Verification is `npx tsc -b --noEmit` plus manual browser smoke checks via `npm run dev`.
- Path alias `@/*` maps to `./src/*`.
- Only exercises with ≥1 logged `WorkoutSession` entry appear as selectable pills — never the full exercise library, and never a hardcoded list.
- "All" date range means genuinely unlimited (no day cutoff) — not the old hardcoded 730-day ceiling.
- Visual system: shadcn `Button` (`variant="default"` active / `"outline"` inactive for toggle pills, `"secondary"`/`"ghost"` for the metric segmented control) and `Card`/`CardContent` for stat tiles, matching the pattern already used in `TemplateDetail.tsx`'s stats card. All colors reference the app's real CSS custom properties (`hsl(var(--background))`, `hsl(var(--card))`, `hsl(var(--border))`, `hsl(var(--primary))`, `hsl(var(--muted-foreground))`, `hsl(var(--foreground))`, `hsl(var(--destructive))`) plus the existing green success token `hsl(142 70% 45%)` already used in `ExerciseCard.tsx`/`WorkoutSummary.tsx` — never a new hardcoded hex value.
- The hand-drawn SVG chart (coordinate math, linear regression, `ResizeObserver` sizing, tooltip positioning) stays exactly as it is today — only its `fill`/`stroke`/`color` literals change.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db.ts` | Modify — add `ExerciseHistoryPoint` type and `groupSessionsByExercise` pure function |
| `src/components/HistoryAnalytics.tsx` | Rewrite — real data wiring (fetch + group + real exercise list + unlimited "All") and shadcn/design-token restyle |

---

## Task 1: Data layer — `groupSessionsByExercise`

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Consumes: `WorkoutSession` (existing, unchanged).
- Produces (used by Task 2):
  ```ts
  export interface ExerciseHistoryPoint {
    t: number;    // session startedAt (ms timestamp)
    peak: number; // max weight logged for this exercise in that session
    vol: number;  // sum(reps × weight) for this exercise in that session
  }
  export function groupSessionsByExercise(sessions: WorkoutSession[]): Record<string, ExerciseHistoryPoint[]>
  ```

- [ ] **Step 1: Add the type and function to `src/lib/db.ts`**

Add this immediately after the existing `sessionSetCount` function (before `getPR`):

```ts
export interface ExerciseHistoryPoint {
  t: number;
  peak: number;
  vol: number;
}

export function groupSessionsByExercise(
  sessions: WorkoutSession[]
): Record<string, ExerciseHistoryPoint[]> {
  const grouped: Record<string, ExerciseHistoryPoint[]> = {};
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) continue;
      const peak = Math.max(...ex.sets.map((s) => s.weight));
      const vol = ex.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      if (!grouped[ex.name]) grouped[ex.name] = [];
      grouped[ex.name].push({ t: session.startedAt, peak, vol });
    }
  }
  for (const points of Object.values(grouped)) {
    points.sort((a, b) => a.t - b.t);
  }
  return grouped;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual verification with the dev server**

Run: `npm run dev`, open the app in a browser, sign in, and in the DevTools console run:

```js
const db = await import("/src/lib/db.ts");
const sessions = await db.getWorkoutSessions();
console.log(sessions.length);
console.log(db.groupSessionsByExercise(sessions));
```

Expected: the logged object has one key per exercise name that appears in at least one session's `exercises` array, each mapping to an array of `{ t, peak, vol }` points sorted ascending by `t`, with `peak`/`vol` matching what you'd compute by hand from that session's logged sets. If this browser profile has zero workout sessions, the result should be `{}` (empty object), not an error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add groupSessionsByExercise for real workout history analytics"
```

---

## Task 2: `HistoryAnalytics.tsx` — real data + shadcn restyle

**Files:**
- Modify: `src/components/HistoryAnalytics.tsx` (full rewrite)

**Interfaces:**
- Consumes: `getWorkoutSessions`, `groupSessionsByExercise`, `type ExerciseHistoryPoint`, `type WorkoutSession` from `@/lib/db` (Task 1 + existing); `Button` from `@/components/ui/button`; `Card`, `CardContent` from `@/components/ui/card`.
- Produces: no props change — `export function HistoryAnalytics(): JSX.Element` stays a no-argument component, unchanged from how `HistoryScreen.tsx` already renders it (`<HistoryAnalytics />`, no props).

- [ ] **Step 1: Replace `src/components/HistoryAnalytics.tsx` in full**

```tsx
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getWorkoutSessions,
  groupSessionsByExercise,
  type ExerciseHistoryPoint,
  type WorkoutSession,
} from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Regression {
  slope: number;
  intercept: number;
  predict: (x: number) => number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  value: number;
  date: string;
}

const MS_DAY = 86400000;

interface DateRange {
  label: string;
  days: number | null; // null = unlimited ("All")
}

const DATE_RANGES: DateRange[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

type Metric = "weight" | "volume";

const mono = "'DM Mono', 'Courier New', monospace";
const sans = "'Inter', system-ui, sans-serif";

// ── Math helpers ──────────────────────────────────────────────────────────────

function linReg(
  pts: ExerciseHistoryPoint[],
  getVal: (p: ExerciseHistoryPoint) => number
): Regression | null {
  const n = pts.length;
  if (n < 2) return null;
  const xs = pts.map((p) => p.t);
  const ys = pts.map(getVal);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  return { slope, intercept, predict: (x: number) => slope * x + intercept };
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function fmtShortDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────

const PAD = { t: 14, r: 16, b: 38, l: 46 };
const CHART_H = 200;

interface ChartProps {
  pts: ExerciseHistoryPoint[];
  getVal: (p: ExerciseHistoryPoint) => number;
  onHover: (tip: TooltipState) => void;
}

function Chart({ pts, getVal, onHover }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(340);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setW(Math.floor(w));
    });
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  if (!pts.length) {
    return (
      <svg
        ref={svgRef}
        width="100%"
        height={CHART_H + PAD.t + PAD.b}
        viewBox={`0 0 ${W} ${CHART_H + PAD.t + PAD.b}`}
      >
        <text
          x={W / 2}
          y={(CHART_H + PAD.t + PAD.b) / 2}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize={12}
          fontFamily={mono}
        >
          No data for this range
        </text>
      </svg>
    );
  }

  const cW = W - PAD.l - PAD.r;
  const vals = pts.map(getVal);
  const times = pts.map((p) => p.t);
  const tMin = Math.min(...times),
    tMax = Math.max(...times);
  const vMin = Math.min(...vals),
    vMax = Math.max(...vals);
  const vPad = (vMax - vMin) * 0.18 || 8;
  const vLo = vMin - vPad,
    vHi = vMax + vPad;

  const tx = (t: number) =>
    PAD.l + (tMax === tMin ? cW / 2 : ((t - tMin) / (tMax - tMin)) * cW);
  const ty = (v: number) => PAD.t + CHART_H - ((v - vLo) / (vHi - vLo)) * CHART_H;

  const reg = linReg(pts, getVal);

  const yTicks = 4;
  const yTickEls = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = vLo + (i / yTicks) * (vHi - vLo);
    const y = ty(v);
    return (
      <g key={i}>
        <line
          x1={PAD.l}
          y1={y}
          x2={PAD.l + cW}
          y2={y}
          stroke="hsl(var(--border))"
          strokeWidth={0.75}
        />
        <text
          x={PAD.l - 7}
          y={y + 4}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={9}
          fontFamily={mono}
        >
          {Math.round(v)}
        </text>
      </g>
    );
  });

  const xCount = Math.min(pts.length, 5);
  const xTickEls = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.round((i / Math.max(xCount - 1, 1)) * (pts.length - 1));
    const pt = pts[idx];
    return (
      <text
        key={i}
        x={tx(pt.t)}
        y={PAD.t + CHART_H + 20}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        fontSize={9}
        fontFamily={mono}
      >
        {fmtShortDate(pt.t)}
      </text>
    );
  });

  const handleDotEnter = (_e: React.MouseEvent<SVGCircleElement>, pt: ExerciseHistoryPoint) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const totalH = CHART_H + PAD.t + PAD.b;
    const scaleX = rect.width / W;
    const scaleY = rect.height / totalH;
    const svgX = tx(pt.t) * scaleX;
    const svgY = ty(getVal(pt)) * scaleY;
    onHover({ visible: true, x: svgX, y: svgY, value: getVal(pt), date: fmtDate(pt.t) });
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={CHART_H + PAD.t + PAD.b}
      viewBox={`0 0 ${W} ${CHART_H + PAD.t + PAD.b}`}
      aria-label={`Scatter chart with ${pts.length} data points and regression line`}
    >
      <defs>
        <linearGradient id="regGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
        </linearGradient>
      </defs>

      {yTickEls}
      {xTickEls}
      <line
        x1={PAD.l}
        y1={PAD.t}
        x2={PAD.l}
        y2={PAD.t + CHART_H}
        stroke="hsl(var(--border))"
        strokeWidth={0.75}
      />

      {reg && (
        <line
          x1={tx(tMin)}
          y1={ty(reg.predict(tMin))}
          x2={tx(tMax)}
          y2={ty(reg.predict(tMax))}
          stroke="url(#regGrad)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.85}
        />
      )}

      {pts.map((pt, i) => (
        <circle
          key={i}
          cx={tx(pt.t)}
          cy={ty(getVal(pt))}
          r={4}
          fill="hsl(var(--primary))"
          stroke="hsl(var(--primary) / 0.6)"
          strokeWidth={1}
          style={{ cursor: "pointer" }}
          onMouseEnter={(e) => handleDotEnter(e, pt)}
          onMouseLeave={() => onHover({ visible: false, x: 0, y: 0, value: 0, date: "" })}
        />
      ))}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HistoryAnalytics() {
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [selEx, setSelEx] = useState("");
  const [selRange, setSelRange] = useState<DateRange>(DATE_RANGES[2]);
  const [metric, setMetric] = useState<Metric>("weight");
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    value: 0,
    date: "",
  });

  useEffect(() => {
    getWorkoutSessions().then(setSessions);
  }, []);

  const grouped = useMemo(
    () => (sessions ? groupSessionsByExercise(sessions) : {}),
    [sessions]
  );
  const EXERCISES = useMemo(() => Object.keys(grouped), [grouped]);

  useEffect(() => {
    if (!selEx && EXERCISES.length > 0) setSelEx(EXERCISES[0]);
  }, [EXERCISES, selEx]);

  const getVal = useCallback(
    (p: ExerciseHistoryPoint) => (metric === "weight" ? p.peak : p.vol),
    [metric]
  );
  const unit = metric === "weight" ? "kg" : "kg vol";

  if (sessions === null) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (EXERCISES.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground text-sm">Log a workout to see your progress</p>
        </CardContent>
      </Card>
    );
  }

  const now = Date.now();
  const allPts = grouped[selEx] ?? [];
  const pts = allPts.filter((p) => selRange.days === null || p.t >= now - selRange.days * MS_DAY);
  const reg = linReg(pts, getVal);

  const vals = pts.map(getVal);
  const current = vals.length ? vals[vals.length - 1] : null;
  const peak = vals.length ? Math.max(...vals) : null;

  let trendDelta: number | null = null;
  if (reg && pts.length >= 2) {
    if (selRange.days !== null) {
      const span = selRange.days * MS_DAY;
      trendDelta = Math.round(reg.predict(now) - reg.predict(now - span));
    } else {
      // "All" has no fixed day span — show the trend across the actual
      // first-to-last data span instead of an arbitrary fixed window.
      trendDelta = Math.round(reg.predict(pts[pts.length - 1].t) - reg.predict(pts[0].t));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: sans }}>
      {/* Exercise selector */}
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Exercise
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        {EXERCISES.map((ex) => (
          <Button
            key={ex}
            variant={selEx === ex ? "default" : "outline"}
            size="sm"
            className="font-mono text-[11px] rounded-full h-auto py-1"
            onClick={() => setSelEx(ex)}
          >
            {ex}
          </Button>
        ))}
      </div>

      {/* Date range */}
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Date range
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        {DATE_RANGES.map((r) => (
          <Button
            key={r.label}
            variant={selRange.label === r.label ? "default" : "outline"}
            size="sm"
            className="font-mono text-[11px] rounded-full h-auto py-1"
            onClick={() => setSelRange(r)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {/* Metric toggle */}
      <div className="flex border border-border rounded-lg overflow-hidden mb-4">
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

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(
          [
            ["Current", current !== null ? `${current}` : "—", "hsl(var(--foreground))"],
            ["Peak", peak !== null ? `${peak}` : "—", "hsl(var(--primary))"],
            [
              "Trend",
              trendDelta !== null ? `${trendDelta >= 0 ? "+" : ""}${trendDelta} ${unit}` : "—",
              trendDelta === null
                ? "hsl(var(--foreground))"
                : trendDelta >= 0
                ? "hsl(142 70% 45%)"
                : "hsl(var(--destructive))",
            ],
          ] as const
        ).map(([label, value, color]) => (
          <Card key={label}>
            <CardContent style={{ padding: "10px 12px" }}>
              <p className="font-mono text-sm font-medium" style={{ color }}>
                {value}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                {label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: "relative" }}>
        <Chart pts={pts} getVal={getVal} onHover={setTooltip} />

        {tooltip.visible && (
          <div
            className="font-mono"
            style={{
              position: "absolute",
              left: Math.max(0, tooltip.x - 55),
              top: tooltip.y - 60,
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              padding: "7px 10px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <p className="text-[15px] font-medium" style={{ color: "hsl(var(--primary))" }}>
              {tooltip.value} {unit}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{tooltip.date}</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3" style={{ paddingLeft: PAD.l }}>
        <div className="flex items-center gap-1.5">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "hsl(var(--primary))",
            }}
          />
          <span className="font-mono text-[10px] text-muted-foreground">session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width={22} height={8}>
            <line
              x1={0}
              y1={4}
              x2={22}
              y2={4}
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          </svg>
          <span className="font-mono text-[10px] text-muted-foreground">trend</span>
        </div>
      </div>
    </div>
  );
}

export default HistoryAnalytics;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the browser (sign in with the test account first, and make sure you have at least one finished workout session in history — log and finish one if this browser profile doesn't have any yet):

1. Navigate to the **History** tab. Confirm the analytics panel no longer shows "Squat"/hardcoded fake exercises — only exercises that actually appear in your logged workout history (e.g. "Bench Press", "Deadlift", whichever you've actually logged).
2. Confirm the exercise pills, date-range pills, and metric toggle are now rendered as proper button/card components matching the app's dark theme (electric-lime active state, not the old lime-on-black custom palette) — visually consistent with the rest of the app (compare against `TemplateDetail`'s stats card style).
3. Select different exercises and confirm the chart, stat cards (Current/Peak/Trend), and tooltip-on-hover all update correctly with your real logged data — peak weight and volume numbers should match what you actually logged.
4. Click through the date range pills (1M/3M/6M/1Y/All). Confirm **All** shows every session for that exercise regardless of age (no 2-year cutoff) — if you only have recent sessions this won't look different from 1Y, but confirm no console errors and the point count doesn't change vs. what you'd expect.
5. If you have fewer than 2 data points for the selected exercise/range, confirm the Trend stat shows "—" (not a crash) and the chart shows the single dot with no regression line (matching the original `linReg` behavior of returning `null` for `n < 2`).
6. If you have zero workout sessions at all in this browser profile (test with a fresh browser profile or after clearing IndexedDB if you want to verify this path), confirm the WHOLE analytics panel is replaced by "Log a workout to see your progress" — no pills, no chart, no stat cards, and no console errors.
7. Scroll down past the analytics panel and confirm the "Workouts" divider and workout list below it are completely unaffected — `HistoryScreen.tsx` itself was not touched by this plan.

- [ ] **Step 4: Commit**

```bash
git add src/components/HistoryAnalytics.tsx
git commit -m "feat: wire HistoryAnalytics to real workout data and restyle with shadcn"
```

---

## Self-Review Notes

- Spec coverage: Subsystem A (data layer), B (data wiring — real exercise list, loading/empty states, unlimited "All"), C (shadcn/design-token restyle), D (date range behavior), E (empty states) are all covered across Tasks 1-2.
- Type consistency: `ExerciseHistoryPoint`, `groupSessionsByExercise` are spelled identically in both tasks.
- One implementation detail beyond the spec's explicit text: the "Trend" stat's calculation needs *some* span to compare against when "All" has no fixed day count. The plan computes it across the actual first-to-last span of the visible points in that case (documented inline in the code) rather than leaving it undefined — this is a natural, minimal completion of the spec's intent ("All" should still show a meaningful trend), not a scope expansion.
- `HistoryScreen.tsx` is explicitly out of scope and untouched — confirmed no task modifies it.

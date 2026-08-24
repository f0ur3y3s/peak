import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import {
  getWorkoutSessions,
  groupSessionsByExercise,
  type ExerciseHistoryPoint,
  type WorkoutSession,
} from "@/lib/db";
import { useWeightUnit, toDisplayWeight } from "@/lib/weightUnit";

// Types

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

const mono = "'DM Mono', monospace";
const sans = "'Inter', system-ui, sans-serif";

// Math helpers

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

// Finds the fewest decimal places (0-2) at which every value in a small
// tick set formats to a distinct label — a narrow value range (e.g. two
// sessions a kg apart) would otherwise round several ticks to the same
// integer and print duplicate labels down the axis.
function tickPrecision(values: number[]): number {
  for (let decimals = 0; decimals <= 2; decimals++) {
    const labels = values.map((v) => v.toFixed(decimals));
    if (new Set(labels).size === labels.length) return decimals;
  }
  return 2;
}

// SVG Chart

const PAD = { t: 14, r: 16, b: 38, l: 46 };
const CHART_H = 200;

interface ChartProps {
  pts: ExerciseHistoryPoint[];
  getVal: (p: ExerciseHistoryPoint) => number;
  onHover: (tip: TooltipState) => void;
}

function Chart({ pts, getVal, onHover }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeTapIdx, setActiveTapIdx] = useState<number | null>(null);
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
          className="text-caption"
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
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => vLo + (i / yTicks) * (vHi - vLo));
  const yPrecision = tickPrecision(yTickValues);
  const yTickEls = yTickValues.map((v, i) => {
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
          className="text-label"
          fontFamily={mono}
        >
          {v.toFixed(yPrecision)}
        </text>
      </g>
    );
  });

  // Skips a candidate tick whose label would duplicate the previous one —
  // several sessions logged on the same day (or any two points close
  // enough in time that day-precision formatting can't tell them apart)
  // would otherwise print the identical date several times in a row.
  const xCount = Math.min(pts.length, 5);
  const xTickEls: JSX.Element[] = [];
  let lastXLabel: string | null = null;
  for (let i = 0; i < xCount; i++) {
    const idx = Math.round((i / Math.max(xCount - 1, 1)) * (pts.length - 1));
    const pt = pts[idx];
    const label = fmtShortDate(pt.t);
    if (label === lastXLabel) continue;
    lastXLabel = label;
    xTickEls.push(
      <text
        key={i}
        x={tx(pt.t)}
        y={PAD.t + CHART_H + 20}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        className="text-label"
        fontFamily={mono}
      >
        {label}
      </text>
    );
  }

  const handleDotEnter = (pt: ExerciseHistoryPoint) => {
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
        <g key={i}>
          {/* Larger invisible hit target — the visible 4px dot is too small
              to reliably tap on a phone, the primary target device. Handles
              both mouse hover and touch tap (onPointerDown covers touch;
              there's no touch equivalent of "leave", so a tap toggles the
              tooltip instead of requiring a hover-out). */}
          <circle
            cx={tx(pt.t)}
            cy={ty(getVal(pt))}
            r={14}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => handleDotEnter(pt)}
            onMouseLeave={() => onHover({ visible: false, x: 0, y: 0, value: 0, date: "" })}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              if (activeTapIdx === i) {
                setActiveTapIdx(null);
                onHover({ visible: false, x: 0, y: 0, value: 0, date: "" });
              } else {
                setActiveTapIdx(i);
                handleDotEnter(pt);
              }
            }}
          />
          <circle
            cx={tx(pt.t)}
            cy={ty(getVal(pt))}
            r={4}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--primary) / 0.6)"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
        </g>
      ))}
    </svg>
  );
}

// Main component

interface HistoryAnalyticsProps {
  /** When set, locks the view to this exercise and hides the exercise selector. */
  focusExercise?: string;
}

export function HistoryAnalytics({ focusExercise }: HistoryAnalyticsProps = {}) {
  const { unit: weightUnit } = useWeightUnit();
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [selEx, setSelEx] = useState(focusExercise ?? "");
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
    // Deliberately unbounded — the "All" date range and the exercise trend
    // line both need the complete history, not a recent slice of it.
    getWorkoutSessions().then(setSessions);
  }, []);

  const grouped = useMemo(
    () => (sessions ? groupSessionsByExercise(sessions) : {}),
    [sessions]
  );
  const EXERCISES = useMemo(() => Object.keys(grouped), [grouped]);

  useEffect(() => {
    if (!focusExercise && !selEx && EXERCISES.length > 0) setSelEx(EXERCISES[0]);
  }, [EXERCISES, selEx, focusExercise]);

  const getVal = useCallback(
    (p: ExerciseHistoryPoint) => (metric === "weight" ? p.peak : p.vol),
    [metric]
  );
  const metricUnitLabel = metric === "weight" ? weightUnit : `${weightUnit} vol`;

  if (sessions === null) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (focusExercise ? !grouped[focusExercise]?.length : EXERCISES.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState
          message={
            focusExercise
              ? `No logged history yet for ${focusExercise}.`
              : "Log a workout to see your progress."
          }
        />
      </div>
    );
  }

  const now = Date.now();
  const allPtsRaw = grouped[selEx] ?? [];
  const allPts = allPtsRaw.map((p) => ({
    t: p.t,
    peak: toDisplayWeight(p.peak, weightUnit),
    vol: toDisplayWeight(p.vol, weightUnit),
  }));
  const pts = allPts.filter((p) => selRange.days === null || p.t >= now - selRange.days * MS_DAY);
  const reg = linReg(pts, getVal);

  const vals = pts.map(getVal);
  const current = vals.length ? vals[vals.length - 1] : null;
  const peak = vals.length ? Math.max(...vals) : null;

  let trendDelta: number | null = null;
  if (reg && pts.length >= 2) {
    // Always measure the trend across the actual first-to-last data span,
    // never the selected range's full calendar length. Extrapolating a
    // regression past the data it was fit on is unsound in general, and
    // breaks badly in a very real case here: two sessions logged close
    // together in time (e.g. same day) produce a near-vertical slope, and
    // projecting that across a fixed 6-month/1-year window multiplies it
    // into a nonsensical value — this is exactly what "All" already did
    // correctly; every range now does the same.
    trendDelta = Math.round(reg.predict(pts[pts.length - 1].t) - reg.predict(pts[0].t));
  }

  return (
    <div style={{ padding: 16, fontFamily: sans }}>
      {/* Exercise selector */}
      {!focusExercise && (
        <>
          <p className="font-mono text-label uppercase tracking-widest text-muted-foreground mb-2">
            Exercise
          </p>
          <div style={{ position: "relative" }} className="mb-3.5">
            <select
              value={selEx}
              onChange={(e) => setSelEx(e.target.value)}
              className="font-mono text-subtext"
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                padding: "10px 36px 10px 12px",
                color: "hsl(var(--foreground))",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
                cursor: "pointer",
              }}
            >
              {EXERCISES.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={2}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "hsl(var(--muted-foreground))",
                pointerEvents: "none",
              }}
            />
          </div>
        </>
      )}

      {/* Date range */}
      <p className="font-mono text-label uppercase tracking-widest text-muted-foreground mb-2">
        Date range
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        {DATE_RANGES.map((r) => (
          <Button
            key={r.label}
            variant={selRange.label === r.label ? "default" : "outline"}
            size="sm"
            className="font-mono text-caption rounded-full h-auto py-1"
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
            className="flex-1 rounded-none font-mono text-caption"
            onClick={() => setMetric(m)}
          >
            {m === "weight" ? `Peak weight (${weightUnit})` : `Total volume (${weightUnit})`}
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
              trendDelta !== null ? `${trendDelta >= 0 ? "+" : ""}${trendDelta} ${metricUnitLabel}` : "—",
              trendDelta === null
                ? "hsl(var(--foreground))"
                : trendDelta >= 0
                ? "hsl(var(--primary))"
                : "hsl(var(--destructive))",
            ],
          ] as const
        ).map(([label, value, color]) => (
          <Card key={label}>
            <CardContent style={{ padding: "10px 12px" }}>
              <p className="font-mono text-sm font-medium" style={{ color }}>
                {value}
              </p>
              <p className="font-mono text-label text-muted-foreground uppercase tracking-wider mt-1">
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
            <p className="text-title font-medium" style={{ color: "hsl(var(--primary))" }}>
              {tooltip.value} {metricUnitLabel}
            </p>
            <p className="text-label text-muted-foreground mt-0.5">{tooltip.date}</p>
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
          <span className="font-mono text-label text-muted-foreground">session</span>
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
          <span className="font-mono text-label text-muted-foreground">trend</span>
        </div>
      </div>
    </div>
  );
}

export default HistoryAnalytics;

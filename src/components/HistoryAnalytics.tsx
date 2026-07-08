import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataPoint {
  t: number;   // timestamp ms
  peak: number; // heaviest set that session (kg)
  vol: number;  // total volume that session (reps * weight)
}

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

// ── Seed data (replace with IndexedDB queries in Phase 2) ─────────────────────
// Group real sets by (exercise_id, workout_date):
//   peak  = MAX(weight) per session
//   vol   = SUM(reps * weight) per session

const MS_DAY = 86400000;
const NOW = Date.now();
const ago = (d: number) => NOW - d * MS_DAY;

function randNorm(mu: number, sigma: number) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function genData(
  basePeak: number, baseVol: number,
  days: number, count: number,
  peakGrowth: number, volGrowth: number
): DataPoint[] {
  const pts: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = ago(days) + Math.random() * days * MS_DAY;
    const progress = (t - ago(days)) / (days * MS_DAY);
    const peak = Math.round(Math.max(20, randNorm(basePeak + peakGrowth * progress, basePeak * 0.025)));
    const vol  = Math.round(Math.max(100, randNorm(baseVol + volGrowth * progress, baseVol * 0.04)));
    pts.push({ t, peak, vol });
  }
  return pts.sort((a, b) => a.t - b.t);
}

const RAW: Record<string, DataPoint[]> = {
  "Bench Press":      genData(100, 2400, 365, 38, 10, 600),
  "Squat":            genData(130, 4200, 365, 34, 15, 900),
  "Deadlift":         genData(160, 3800, 365, 28, 20, 1100),
  "Incline DB Press": genData(34,  900,  365, 32, 4,  300),
  "Tricep Pushdown":  genData(42,  1800, 365, 40, 3,  200),
};

const EXERCISES = Object.keys(RAW);

const DATE_RANGES = [
  { label: "1M",  days: 30  },
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1Y",  days: 365 },
  { label: "All", days: 730 },
];

type Metric = "weight" | "volume";

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  bg:       "#0f0f0f",
  surface:  "#1a1a1a",
  surface2: "#222222",
  border:   "#2a2a2a",
  grid:     "#1e1e1e",
  accent:   "#e8ff47",
  accentLo: "#b8cc30",
  muted:    "#555555",
  text:     "#e8e8e8",
  text2:    "#777777",
  green:    "#3ecf8e",
  red:      "#ff4d4d",
};

const mono = "'DM Mono', 'Courier New', monospace";
const sans = "'Inter', system-ui, sans-serif";

// ── Math helpers ──────────────────────────────────────────────────────────────

function linReg(pts: DataPoint[], getVal: (p: DataPoint) => number): Regression | null {
  const n = pts.length;
  if (n < 2) return null;
  const xs = pts.map(p => p.t);
  const ys = pts.map(getVal);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
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
    day: "numeric", month: "short", year: "2-digit",
  });
}

function fmtShortDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────

const PAD = { t: 14, r: 16, b: 38, l: 46 };
const CHART_H = 200;

interface ChartProps {
  pts: DataPoint[];
  getVal: (p: DataPoint) => number;
  onHover: (tip: TooltipState) => void;
}

function Chart({ pts, getVal, onHover }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(340);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setW(Math.floor(w));
    });
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  if (!pts.length) {
    return (
      <svg ref={svgRef} width="100%" height={CHART_H + PAD.t + PAD.b} viewBox={`0 0 ${W} ${CHART_H + PAD.t + PAD.b}`}>
        <text x={W / 2} y={(CHART_H + PAD.t + PAD.b) / 2} textAnchor="middle" fill={C.muted} fontSize={12} fontFamily={mono}>
          No data for this range
        </text>
      </svg>
    );
  }

  const cW = W - PAD.l - PAD.r;
  const vals  = pts.map(getVal);
  const times = pts.map(p => p.t);
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const vMin = Math.min(...vals),  vMax = Math.max(...vals);
  const vPad = (vMax - vMin) * 0.18 || 8;
  const vLo = vMin - vPad, vHi = vMax + vPad;

  const tx = (t: number) =>
    PAD.l + (tMax === tMin ? cW / 2 : ((t - tMin) / (tMax - tMin)) * cW);
  const ty = (v: number) =>
    PAD.t + CHART_H - ((v - vLo) / (vHi - vLo)) * CHART_H;

  const reg = linReg(pts, getVal);

  // Y-axis ticks
  const yTicks = 4;
  const yTickEls = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = vLo + (i / yTicks) * (vHi - vLo);
    const y = ty(v);
    return (
      <g key={i}>
        <line x1={PAD.l} y1={y} x2={PAD.l + cW} y2={y} stroke={C.grid} strokeWidth={0.75} />
        <text x={PAD.l - 7} y={y + 4} textAnchor="end" fill={C.muted} fontSize={9} fontFamily={mono}>
          {Math.round(v)}
        </text>
      </g>
    );
  });

  // X-axis labels
  const xCount = Math.min(pts.length, 5);
  const xTickEls = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.round((i / Math.max(xCount - 1, 1)) * (pts.length - 1));
    const pt  = pts[idx];
    return (
      <text key={i} x={tx(pt.t)} y={PAD.t + CHART_H + 20} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={mono}>
        {fmtShortDate(pt.t)}
      </text>
    );
  });

  // Dot hover handler — positions tooltip relative to SVG parent
  const handleDotEnter = (_e: React.MouseEvent<SVGCircleElement>, pt: DataPoint) => {
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
          <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
          <stop offset="100%" stopColor={C.accent} stopOpacity={0.9} />
        </linearGradient>
      </defs>

      {/* Grid + axes */}
      {yTickEls}
      {xTickEls}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + CHART_H} stroke={C.border} strokeWidth={0.75} />

      {/* Regression line */}
      {reg && (
        <line
          x1={tx(tMin)} y1={ty(reg.predict(tMin))}
          x2={tx(tMax)} y2={ty(reg.predict(tMax))}
          stroke="url(#regGrad)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.85}
        />
      )}

      {/* Data points */}
      {pts.map((pt, i) => (
        <circle
          key={i}
          cx={tx(pt.t)}
          cy={ty(getVal(pt))}
          r={4}
          fill={C.accent}
          stroke={C.accentLo}
          strokeWidth={1}
          style={{ cursor: "pointer" }}
          onMouseEnter={e => handleDotEnter(e, pt)}
          onMouseLeave={() => onHover({ visible: false, x: 0, y: 0, value: 0, date: "" })}
        />
      ))}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HistoryAnalytics() {
  const [selEx,    setSelEx]    = useState(EXERCISES[0]);
  const [selRange, setSelRange] = useState(DATE_RANGES[2]);
  const [metric,   setMetric]   = useState<Metric>("weight");
  const [tooltip,  setTooltip]  = useState<TooltipState>({ visible: false, x: 0, y: 0, value: 0, date: "" });

  const getVal  = useCallback((p: DataPoint) => metric === "weight" ? p.peak : p.vol, [metric]);
  const unit    = metric === "weight" ? "kg" : "kg vol";

  const pts = RAW[selEx].filter(p => p.t >= NOW - selRange.days * MS_DAY);
  const reg = linReg(pts, getVal);

  // Stats
  const vals    = pts.map(getVal);
  const current = vals.length ? vals[vals.length - 1] : null;
  const peak    = vals.length ? Math.max(...vals) : null;

  let trendDelta: number | null = null;
  if (reg && pts.length >= 2) {
    const span = selRange.days * MS_DAY;
    trendDelta = Math.round(reg.predict(NOW) - reg.predict(NOW - span));
  }

  // Pill factory
  const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        fontFamily: mono, fontSize: 11, padding: "5px 12px",
        borderRadius: 999, border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : C.surface,
        color: active ? "#000" : C.text2,
        cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ background: C.bg, borderRadius: 16, padding: 16, color: C.text, fontFamily: sans }}>

      {/* Exercise selector */}
      <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text2, marginBottom: 8 }}>
        Exercise
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {EXERCISES.map(ex => (
          <Pill key={ex} label={ex} active={selEx === ex} onClick={() => setSelEx(ex)} />
        ))}
      </div>

      {/* Date range */}
      <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text2, marginBottom: 8 }}>
        Date range
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {DATE_RANGES.map(r => (
          <Pill key={r.label} label={r.label} active={selRange === r} onClick={() => setSelRange(r)} />
        ))}
      </div>

      {/* Metric toggle */}
      <div style={{
        display: "flex", background: C.surface2,
        borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 16,
      }}>
        {(["weight", "volume"] as Metric[]).map(m => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            style={{
              flex: 1, padding: "8px 10px", fontFamily: mono, fontSize: 11,
              background: metric === m ? C.surface : "none",
              border: "none", color: metric === m ? C.text : C.text2,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {m === "weight" ? "Peak weight (kg)" : "Total volume (kg)"}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Current", value: current !== null ? `${current}` : "—", color: C.text },
          { label: "Peak",    value: peak    !== null ? `${peak}`    : "—", color: C.accent },
          {
            label: "Trend",
            value: trendDelta !== null
              ? `${trendDelta >= 0 ? "+" : ""}${trendDelta} ${unit}`
              : "—",
            color: trendDelta === null ? C.text : trendDelta >= 0 ? C.green : C.red,
          },
        ].map(s => (
          <div key={s.label} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "10px 12px",
          }}>
            <p style={{ fontFamily: mono, fontSize: 14, fontWeight: 500, color: s.color, lineHeight: 1.1 }}>{s.value}</p>
            <p style={{ fontFamily: mono, fontSize: 10, color: C.text2, marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: "relative" }}>
        <Chart pts={pts} getVal={getVal} onHover={setTooltip} />

        {/* Tooltip */}
        {tooltip.visible && (
          <div style={{
            position: "absolute",
            left: Math.max(0, tooltip.x - 55),
            top: tooltip.y - 60,
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "7px 10px",
            fontFamily: mono, pointerEvents: "none",
            whiteSpace: "nowrap", zIndex: 10,
          }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: C.accent }}>{tooltip.value} {unit}</p>
            <p style={{ fontSize: 10, color: C.text2, marginTop: 2 }}>{tooltip.date}</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, paddingLeft: PAD.l }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: C.text2 }}>session</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width={22} height={8}>
            <line x1={0} y1={4} x2={22} y2={4} stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
          </svg>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.text2 }}>trend</span>
        </div>
      </div>
    </div>
  );
}

export default HistoryAnalytics;

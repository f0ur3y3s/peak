import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtTime, type TimerState } from "@/lib/data";

interface TimerSheetProps {
  timer: TimerState;
  onClose: () => void;
}

const NAV_H = 60;
const COLLAPSE_THRESHOLD = 80;

export function TimerSheet({ timer, onClose }: TimerSheetProps) {
  const { seconds: totalSeconds, exerciseName, nextSet } = timer;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Countdown
  useEffect(() => {
    if (remaining <= 0) return;
    const iv = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [remaining]);

  const pct = (remaining / totalSeconds) * 100;
  const danger = remaining <= 10 && remaining > 0;
  const done = remaining === 0;

  const timerColor = done
    ? "hsl(72 100% 64%)"
    : danger
    ? "hsl(4 90% 62%)"
    : "hsl(0 0% 94%)";

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    dragDeltaRef.current = 0;
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    dragDeltaRef.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${Math.max(0, delta)}px)`;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    if (sheetRef.current) sheetRef.current.style.transform = "";
    if (dragDeltaRef.current > COLLAPSE_THRESHOLD) {
      setCollapsed(true);
    }
    startYRef.current = null;
    dragDeltaRef.current = 0;
  }, []);

  return (
    <div
      className="timer-sheet"
      ref={sheetRef}
      style={{
        bottom: collapsed ? NAV_H : 0,
        transition: dragging
          ? "none"
          : "bottom 0.3s cubic-bezier(.32,.72,0,1), transform 0.3s cubic-bezier(.32,.72,0,1)",
      }}
    >
      <div
        className="timer-sheet-inner"
        style={{
          borderColor: done ? "hsl(72 100% 64% / 0.5)" : undefined,
        }}
      >
        {collapsed ? (
          /* ── Collapsed pill ── */
          <div
            className="timer-pill"
            onClick={() => setCollapsed(false)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="drag-handle" style={{ margin: 0 }} />
            <div className="flex items-center gap-2.5 flex-1 justify-center">
              <span className="text-muted-foreground text-[13px]">{exerciseName}</span>
              <span
                className="font-mono text-[22px] font-medium tracking-tight"
                style={{ color: timerColor }}
              >
                {fmtTime(remaining)}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="bg-transparent border-none text-muted-foreground cursor-pointer text-lg px-1"
            >
              ×
            </button>
          </div>
        ) : (
          /* ── Full sheet ── */
          <>
            <div
              className="drag-handle"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />

            <div className="flex flex-col items-center px-6 pt-6 pb-9 gap-0">
              {/* Context */}
              <p className="font-mono text-[11px] text-muted-foreground tracking-widest uppercase mb-1">
                {exerciseName}
              </p>
              <p className="text-[13px] text-muted-foreground mb-9">
                {done ? "Time to lift" : nextSet}
              </p>

              {/* Big countdown */}
              <p
                className="font-mono font-medium tracking-tighter leading-none mb-8"
                style={{
                  fontSize: 88,
                  color: timerColor,
                  transition: "color 0.3s",
                }}
              >
                {fmtTime(remaining)}
              </p>

              {/* Progress bar */}
              <div className="w-full mb-9">
                <Progress value={pct} className="h-[3px]" />
              </div>

              {/* Controls */}
              <div className="flex gap-2.5 mb-5">
                {([["−30s", -30], ["+30s", 30]] as const).map(([label, d]) => (
                  <Button
                    key={label}
                    variant="outline"
                    onClick={() => setRemaining((r) => Math.max(0, Math.min(600, r + d)))}
                    className="font-mono text-[13px] min-w-[76px]"
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {/* Skip / done */}
              <Button
                variant="ghost"
                onClick={onClose}
                className="font-mono text-xs tracking-widest"
                style={{ color: done ? "hsl(72 100% 64%)" : "hsl(var(--muted-foreground))" }}
              >
                {done ? "Back to workout →" : "skip"}
              </Button>
            </div>

            {/* Done accent bar */}
            {done && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtTime, type TimerState } from "@/lib/data";

interface TimerSheetProps {
  timer: TimerState;
  onClose: () => void;
}

// Matches --nav-total-h in index.css (the 60px tab row plus whatever
// safe-area inset the nav bar pads out by) so the collapsed pill sits
// fully above the nav bar instead of under its inset portion.
const NAV_H = "var(--nav-total-h)";
const COLLAPSE_THRESHOLD = 80;

export function TimerSheet({ timer, onClose }: TimerSheetProps) {
  const { seconds: totalSeconds, exerciseName, nextSet } = timer;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ActiveWorkout renders one <TimerSheet> for the whole workout and just
  // swaps the `timer` prop on every logged set (no `key`, so this component
  // never remounts) — without this, `remaining`'s useState initializer only
  // ran once on the very first rest period, so a second set logged while
  // the sheet was still open/collapsed kept counting down from the
  // *previous* period's leftover time instead of restarting.
  useEffect(() => {
    setRemaining(totalSeconds);
    setCollapsed(false);
  }, [timer, totalSeconds]);

  // Countdown — depends only on [timer], not [remaining], so the interval
  // isn't torn down and recreated every single tick (60x/minute).
  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [timer]);

  // Screen-reader announcement — the visual countdown updates every second,
  // but announcing every second would drown a screen-reader user in noise.
  // Only announce at a handful of meaningful checkpoints instead.
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncedRef = useRef<number | null>(null);
  useEffect(() => {
    lastAnnouncedRef.current = null;
  }, [timer]);
  useEffect(() => {
    const milestones = [60, 30, 15, 10, 5, 4, 3, 2, 1, 0];
    if (!milestones.includes(remaining) || lastAnnouncedRef.current === remaining) return;
    lastAnnouncedRef.current = remaining;
    setAnnouncement(remaining === 0 ? "Rest complete — time to lift" : `${remaining} seconds left`);
  }, [remaining]);

  const pct = (remaining / totalSeconds) * 100;
  const danger = remaining <= 10 && remaining > 0;
  const done = remaining === 0;

  const timerColor = done
    ? "hsl(var(--primary))"
    : danger
    ? "hsl(var(--destructive))"
    : "hsl(var(--foreground))";

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
      {/* Visually hidden — announces the rest countdown at a handful of
          checkpoints instead of the visual per-second tick, which would
          otherwise be silent to (if throttled) or overwhelming for (if not)
          a screen-reader user. */}
      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>
      <div
        className="timer-sheet-inner"
        style={{
          borderColor: done ? "hsl(var(--primary) / 0.5)" : undefined,
        }}
      >
        {collapsed ? (
          /* Collapsed pill */
          <div
            className="timer-pill"
            onClick={() => setCollapsed(false)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="drag-handle" style={{ margin: 0 }} />
            <div className="flex items-center gap-2.5 flex-1 justify-center">
              <span className="text-muted-foreground text-subtext">{exerciseName}</span>
              <span
                className="font-mono text-stat font-medium tracking-tight"
                style={{ color: timerColor }}
              >
                {fmtTime(remaining)}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="bg-transparent border-none text-muted-foreground cursor-pointer text-lg px-1"
              aria-label="Close timer"
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        ) : (
          /* Full sheet */
          <>
            <div
              className="drag-handle"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />

            <div
              className="flex flex-col items-center px-6 pt-6 gap-0"
              style={{ paddingBottom: "calc(2.25rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {/* Context */}
              <p className="font-mono text-caption text-muted-foreground tracking-widest uppercase mb-1">
                {exerciseName}
              </p>
              <p className="text-subtext text-muted-foreground mb-9">
                {done ? "Time to lift" : nextSet}
              </p>

              {/* Big countdown */}
              <p
                className="font-mono font-medium tracking-tighter leading-none mb-8 text-countdown"
                style={{
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
                {([-30, 30] as const).map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    onClick={() => setRemaining((r) => Math.max(0, Math.min(600, r + d)))}
                    className="font-mono text-subtext min-w-[76px] gap-1"
                  >
                    {d < 0 ? <Minus size={16} strokeWidth={2} /> : <Plus size={16} strokeWidth={2} />}
                    {Math.abs(d)}s
                  </Button>
                ))}
              </div>

              {/* Skip / done */}
              <Button
                variant="ghost"
                onClick={onClose}
                className="font-mono text-xs tracking-widest gap-1.5"
                style={{ color: done ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
              >
                {done ? (
                  <>
                    Back to workout
                    <ArrowRight size={16} strokeWidth={2} />
                  </>
                ) : (
                  "skip"
                )}
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

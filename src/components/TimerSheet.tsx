import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtTime, type TimerState } from "@/lib/data";
import { fireRestAlert } from "@/lib/restAlert";

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
  // The countdown is anchored to a wall-clock deadline rather than held as a
  // number that a setInterval decrements. An interval is not a clock: iOS
  // Safari freezes timers when the phone locks or the app is backgrounded,
  // and Chrome throttles hidden tabs to roughly one tick a minute — so the
  // decrementing version showed ~3:28 left after a two-minute rest, which for
  // a rest timer is a wrong answer rather than a cosmetic wobble. Deriving
  // from Date.now() means time away from the app is counted, however the
  // browser treats the tick.
  const [endsAt, setEndsAt] = useState(() => Date.now() + totalSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
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
    setEndsAt(Date.now() + totalSeconds * 1000);
    setNow(Date.now());
    setCollapsed(false);
  }, [timer, totalSeconds]);

  // Ticks faster than once a second so the display corrects itself promptly
  // when the browser resumes a throttled or frozen tab, rather than showing a
  // stale value until the next whole second. The rendered value is derived
  // from the deadline, so a missed tick costs nothing.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
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

  // The alert, fired once as the countdown crosses zero. Guarded by a ref
  // rather than by `remaining === 0` alone: the tick runs four times a second
  // and would otherwise re-fire the vibration and tone continuously for as
  // long as the finished sheet stayed open.
  //
  // Re-arming is driven by `remaining` climbing back above zero and nothing
  // else — which covers both a new rest period (the effect above pushes the
  // deadline out) and a "+30s" tapped after the alert has already gone off.
  // An earlier version re-armed in a second effect keyed on `timer`, which
  // React's development double-invoke ran between the two halves of this one:
  // arm, fire, arm again, fire again. Two buzzes per set, in dev only, which
  // is exactly the kind of thing that ships.
  const alertedRef = useRef(false);
  useEffect(() => {
    if (remaining > 0) {
      alertedRef.current = false;
      return;
    }
    if (alertedRef.current) return;
    alertedRef.current = true;
    fireRestAlert(exerciseName);
  }, [remaining, exerciseName]);

  // Clamped: "+30" can push the remaining time past the original duration,
  // which drove the indicator outside its own overflow-hidden track and read
  // as 0% complete. A zero-second rest (the stepper allows it) would divide
  // by zero.
  const pct = totalSeconds > 0 ? Math.min(100, Math.max(0, (remaining / totalSeconds) * 100)) : 0;
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
              className="bg-transparent border-none text-muted-foreground cursor-pointer"
              style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", marginRight: -8 }}
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
                <Progress
                  value={pct}
                  className="h-[3px]"
                  aria-label="Rest remaining"
                  aria-valuetext={fmtTime(remaining)}
                />
              </div>

              {/* Controls */}
              <div className="flex gap-2.5 mb-5">
                {([-30, 30] as const).map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    onClick={() =>
                      setEndsAt((prev) => {
                        const left = Math.max(0, Math.ceil((prev - Date.now()) / 1000));
                        const next = Math.max(0, Math.min(600, left + d));
                        // No movement means no new deadline. Re-anchoring to
                        // Date.now() when the clamp already pinned the value
                        // pushed the deadline a fraction of a tick into the
                        // future, so a "-30s" pressed at 0:00 flickered back
                        // to 0:01 and fired the rest alert a second time.
                        return next === left ? prev : Date.now() + next * 1000;
                      })
                    }
                    className="font-mono text-subtext min-w-[76px] gap-1"
                  >
                    {d < 0 ? <Minus size={16} strokeWidth={2} /> : <Plus size={16} strokeWidth={2} />}
                    {Math.abs(d)}s
                  </Button>
                ))}
              </div>

              {/* Skip / done */}
              <Button
                variant="outline"
                onClick={onClose}
                className="font-mono text-subtext tracking-widest gap-1.5"
                style={{
                  minWidth: 160,
                  color: done ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  borderColor: done ? "hsl(var(--primary) / 0.5)" : undefined,
                }}
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

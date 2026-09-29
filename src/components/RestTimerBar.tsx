import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { Progress } from "@/components/ui/progress";
import { fmtTime, restRemaining, type TimerState } from "@/lib/data";
import { fireRestAlert } from "@/lib/restAlert";
import { cn } from "@/lib/utils";

interface RestTimerBarProps {
  timer: TimerState;
  /** Moves the deadline; the owner applies it so the push follows too. */
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
}

/**
 * The rest countdown, as a slim bar docked above the nav bar.
 *
 * It replaced a bottom sheet that opened over most of the workout after every
 * set and could only be put away by dragging a 4px handle — mid-set, with
 * chalky hands, that mostly didn't work. Nothing here is a gesture: every
 * control is a plain button, and the bar never covers the exercise being
 * logged (the workout list already pads its bottom past it).
 *
 * Tapping the countdown opens a focus view — the same timer, big enough to read
 * from across the gym — and tapping it again (or the chevron, or Escape) puts
 * it back. Both views read the one deadline, so nothing is lost switching.
 */
export function RestTimerBar({ timer, onAdjust, onDismiss }: RestTimerBarProps) {
  const { totalSeconds, exerciseName, nextSet } = timer;

  // Ticks faster than once a second so the display corrects itself promptly
  // when the browser resumes a throttled or frozen tab. The value is derived
  // from the deadline, so a missed tick costs nothing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);

  const remaining = restRemaining(timer, now);
  const done = remaining === 0;
  const danger = remaining <= 10 && !done;

  // Screen-reader announcements at a handful of checkpoints — every second
  // would drown a screen-reader user, and the visual tick is silent.
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncedRef = useRef<number | null>(null);
  useEffect(() => {
    const milestones = [60, 30, 15, 10, 5, 4, 3, 2, 1, 0];
    if (!milestones.includes(remaining) || lastAnnouncedRef.current === remaining) return;
    lastAnnouncedRef.current = remaining;
    setAnnouncement(done ? "Rest complete — time to lift" : `${remaining} seconds left`);
  }, [remaining, done]);

  // Fired once as the countdown crosses zero, not on every tick at zero.
  // Re-armed only by `remaining` climbing back above zero — a new rest period
  // or a "+30" after the alert — never by a separate effect, which React's
  // development double-invoke ran between arm and fire: two buzzes per set.
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

  // Clamped: "+30" can push the remaining time past the starting duration,
  // and a zero-second rest would divide by zero.
  const pct = totalSeconds > 0 ? Math.min(100, Math.max(0, (remaining / totalSeconds) * 100)) : 0;
  const countdownColor = done ? "text-primary" : danger ? "text-destructive" : "text-foreground";

  const [focused, setFocused] = useState(false);

  return (
    <section className={cn("rest-bar", done && "rest-bar-done")} aria-label="Rest timer">
      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>

      <Progress
        value={pct}
        className="h-[2px] rounded-none bg-transparent"
        aria-label="Rest remaining"
        aria-valuetext={fmtTime(remaining)}
      />

      <div className="flex items-center gap-1 pl-5 pr-2 py-1.5">
        <button
          type="button"
          onClick={() => setFocused(true)}
          className="flex-1 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer"
          aria-haspopup="dialog"
          aria-label={`${fmtTime(remaining)} rest left. Open large timer`}
        >
          <p className={cn("font-mono text-stat font-medium tracking-tight", countdownColor)}>
            {fmtTime(remaining)}
          </p>
          <p className="text-caption text-muted-foreground truncate">
            {done ? "Time to lift" : nextSet} · {exerciseName}
          </p>
        </button>

        {!done &&
          ([-30, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onAdjust(d)}
              className="rest-bar-button font-mono text-subtext"
              aria-label={d < 0 ? "30 seconds less rest" : "30 seconds more rest"}
            >
              {d < 0 ? "−30" : "+30"}
            </button>
          ))}

        <button
          type="button"
          onClick={onDismiss}
          className={cn("rest-bar-button", done && "text-primary")}
          aria-label={done ? "Dismiss rest timer" : "Skip rest"}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      {focused && (
        <RestFocusView
          remaining={remaining}
          pct={pct}
          countdownColor={countdownColor}
          done={done}
          exerciseName={exerciseName}
          nextSet={nextSet}
          onAdjust={onAdjust}
          onDismiss={onDismiss}
          onMinimise={() => setFocused(false)}
        />
      )}
    </section>
  );
}

interface RestFocusViewProps {
  remaining: number;
  pct: number;
  countdownColor: string;
  done: boolean;
  exerciseName: string;
  nextSet: string;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
  onMinimise: () => void;
}

/** The full-screen view of the same rest. Presentation only — RestTimerBar owns
 *  the tick, the alert and the announcements, so they never run twice. */
function RestFocusView({
  remaining,
  pct,
  countdownColor,
  done,
  exerciseName,
  nextSet,
  onAdjust,
  onDismiss,
  onMinimise,
}: RestFocusViewProps) {
  const titleId = useId();
  return (
    <Modal onClose={onMinimise} labelledBy={titleId} className="rest-focus">
      <button
        type="button"
        onClick={onMinimise}
        className="rest-bar-button self-end"
        aria-label="Minimise timer"
      >
        <ChevronDown size={24} strokeWidth={2} />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <h2 id={titleId} className="font-mono text-caption text-muted-foreground tracking-widest uppercase mb-1">
          {exerciseName}
        </h2>
        <p className="text-subtext text-muted-foreground mb-9">{done ? "Time to lift" : nextSet}</p>

        {/* Tapping the number again is the quickest way back — it is where
            the thumb already is. */}
        <button
          type="button"
          onClick={onMinimise}
          className={cn(
            "font-mono font-medium tracking-tighter leading-none mb-8 text-countdown bg-transparent border-none p-0 cursor-pointer",
            countdownColor
          )}
          style={{ transition: "color 0.3s" }}
          aria-label={`${fmtTime(remaining)} rest left. Minimise timer`}
        >
          {fmtTime(remaining)}
        </button>

        <div className="w-full mb-9">
          <Progress value={pct} className="h-[3px]" aria-label="Rest remaining" aria-valuetext={fmtTime(remaining)} />
        </div>

        {!done && (
          <div className="flex gap-2.5 mb-5">
            {([-30, 30] as const).map((d) => (
              <Button
                key={d}
                variant="outline"
                onClick={() => onAdjust(d)}
                className="font-mono text-subtext min-w-[76px] gap-1"
                aria-label={d < 0 ? "30 seconds less rest" : "30 seconds more rest"}
              >
                {d < 0 ? <Minus size={16} strokeWidth={2} /> : <Plus size={16} strokeWidth={2} />}
                30s
              </Button>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          onClick={onDismiss}
          className={cn("font-mono text-subtext tracking-widest min-w-[160px]", done && "text-primary border-primary/50")}
        >
          {done ? "Back to workout" : "Skip rest"}
        </Button>
      </div>
    </Modal>
  );
}

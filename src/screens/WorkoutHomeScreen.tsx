import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { fmtRelativeDate } from "@/lib/utils";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";
import {
  getWorkoutSessions,
  getNextUpTemplateId,
  getTemplate,
  sessionVolume,
  sessionSetCount,
  type Template,
  type WorkoutSession,
} from "@/lib/db";

interface WorkoutHomeScreenProps {
  onBrowseTemplates: () => void;
  onSelectTemplate: (id: string) => void;
  onStartTemplate: (id: string) => void;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Monday of the week containing `now`, at local midnight. */
function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dayFromMonday = (d.getDay() + 6) % 7;
  return d.getTime() - dayFromMonday * DAY_MS;
}

/** The heaviest set of a session, which is what a lifter actually recalls of
 *  it — unlike total volume, which mostly tracks how many exercises it had. */
function topSet(session: WorkoutSession): { name: string; reps: number; weight: number } | null {
  let best: { name: string; reps: number; weight: number } | null = null;
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (!best || set.weight > best.weight) {
        best = { name: ex.name, reps: set.reps, weight: set.weight };
      }
    }
  }
  return best;
}

// The landing screen for a returning user with no workout in progress. It
// leads with the session their split says to do next, because that is the one
// decision this screen exists to remove.
export function WorkoutHomeScreen({
  onBrowseTemplates,
  onSelectTemplate,
  onStartTemplate,
}: WorkoutHomeScreenProps) {
  const { unit } = useWeightUnit();
  const [loaded, setLoaded] = useState(false);
  const [lastSession, setLastSession] = useState<WorkoutSession | null>(null);
  const [weekDays, setWeekDays] = useState<boolean[]>([]);
  const [nextUp, setNextUp] = useState<Template | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 50 comfortably bounds a trailing week of sessions while avoiding an
    // unbounded read of a long history just to render this screen.
    Promise.all([getWorkoutSessions(50), getNextUpTemplateId()])
      .then(async ([sessions, templateId]) => {
        if (cancelled) return;
        setLastSession(sessions[0] ?? null);

        const weekStart = startOfWeek(Date.now());
        const done = new Array(7).fill(false);
        for (const s of sessions) {
          const dayIndex = Math.floor((s.startedAt - weekStart) / DAY_MS);
          if (dayIndex >= 0 && dayIndex < 7) done[dayIndex] = true;
        }
        setWeekDays(done);

        const template = templateId ? await getTemplate(templateId) : undefined;
        if (cancelled) return;
        setNextUp(template ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return <TopBar title="Train" />;

  if (!nextUp && !lastSession) {
    return (
      <div>
        <TopBar title="Train" />
        <div className="px-5">
          <EmptyState
            message="Build a session to log your first workout."
            action={{ label: "Go to Plan", onClick: onBrowseTemplates }}
          />
        </div>
      </div>
    );
  }

  const todayIndex = Math.floor((Date.now() - startOfWeek(Date.now())) / DAY_MS);
  const doneThisWeek = weekDays.filter(Boolean).length;
  const best = lastSession ? topSet(lastSession) : null;

  return (
    <div>
      <TopBar
        title="Train"
        right={
          <span className="font-mono text-caption text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </span>
        }
      />
      <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
        {nextUp && (
          <Card>
            <CardContent style={{ padding: 18 }} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="font-mono text-label uppercase tracking-widest" style={{ color: "hsl(var(--primary))" }}>
                  Next up
                </p>
                <p className="text-2xl font-bold tracking-tight">{nextUp.name}</p>
                {nextUp.notes && (
                  <p className="text-subtext text-muted-foreground" style={{ lineHeight: 1.45 }}>
                    {nextUp.notes.split(/[.:]\s/)[0]}
                  </p>
                )}
              </div>

              <div className="flex gap-6">
                <div>
                  <p className="font-mono text-base font-medium">{nextUp.exercises.length}</p>
                  <p className="text-caption text-muted-foreground mt-px">exercises</p>
                </div>
                <div>
                  <p className="font-mono text-base font-medium">
                    {nextUp.exercises.reduce((sum, e) => sum + e.targetSets, 0)}
                  </p>
                  <p className="text-caption text-muted-foreground mt-px">sets</p>
                </div>
                <div>
                  <p className="font-mono text-base font-medium">
                    ~{Math.round(nextUp.exercises.reduce((sum, e) => sum + e.restSeconds * e.targetSets, 0) / 60)}m
                  </p>
                  <p className="text-caption text-muted-foreground mt-px">resting</p>
                </div>
              </div>

              <Button
                className="w-full font-bold"
                style={{ height: 56, fontSize: "1rem" }}
                disabled={nextUp.exercises.length === 0}
                onClick={() => onStartTemplate(nextUp.id)}
              >
                Start {nextUp.name}
              </Button>
            </CardContent>
          </Card>
        )}

        {weekDays.length === 7 && (
          <Card style={{ background: "hsl(var(--surface-sunken))" }}>
            <CardContent style={{ padding: "15px 18px" }} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-label text-muted-foreground uppercase tracking-widest">
                  This week
                </p>
                <p className="font-mono text-caption">{doneThisWeek} logged</p>
              </div>
              <div className="flex gap-2">
                {WEEKDAYS.map((label, i) => {
                  const isToday = i === todayIndex;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5" style={{ flex: 1 }}>
                      <div
                        style={{
                          width: "100%",
                          height: 30,
                          borderRadius: 6,
                          background: weekDays[i] ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                          border: isToday && !weekDays[i] ? "1px dashed hsl(var(--muted-foreground))" : undefined,
                          boxSizing: "border-box",
                        }}
                        aria-label={`${label}${weekDays[i] ? ": trained" : ""}`}
                      />
                      <span
                        className="font-mono text-label"
                        style={{ color: isToday ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {lastSession && (
          <div>
            <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2">
              Last session
            </p>
            <Card
              onClick={() => lastSession.templateId && onSelectTemplate(lastSession.templateId)}
              className={lastSession.templateId ? "cursor-pointer" : undefined}
            >
              <CardContent style={{ padding: "14px 16px" }} className="flex flex-col gap-1.5">
                <div className="flex gap-2 items-center">
                  <p className="font-semibold text-title">{lastSession.templateName}</p>
                  {lastSession.prs.length > 0 && (
                    <Badge
                      className="text-label"
                      style={{
                        padding: "1px 6px",
                        background: "hsl(var(--success) / 0.18)",
                        color: "hsl(var(--success))",
                        letterSpacing: "0.08em",
                      }}
                    >
                      PR
                    </Badge>
                  )}
                </div>
                {best && (
                  <p className="font-mono text-body">
                    {best.name} {best.reps}×{fmtWeight(best.weight, unit)} {unit}
                  </p>
                )}
                <p className="font-mono text-caption text-muted-foreground">
                  {fmtRelativeDate(lastSession.startedAt)} · {sessionSetCount(lastSession)} sets ·{" "}
                  {Number(fmtWeight(sessionVolume(lastSession), unit)).toLocaleString()} {unit}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Button variant="outline" className="w-full text-muted-foreground" onClick={onBrowseTemplates}>
          All sessions
        </Button>
      </div>
    </div>
  );
}

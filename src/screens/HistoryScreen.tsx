import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { HistoryAnalytics } from "@/components/HistoryAnalytics";
import { getWorkoutSessions, sessionVolume, sessionSetCount, type WorkoutSession } from "@/lib/db";
import { fmtRelativeDate } from "@/lib/utils";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";

export function HistoryScreen() {
  const { unit } = useWeightUnit();
  // The log is what this tab is for. The analytics panel — exercise picker,
  // five range chips, a metric toggle, three tiles and a chart — used to come
  // first, putting the actual workout list about 660px down the screen.
  const [view, setView] = useState<"log" | "progress">("log");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately unbounded — this screen's whole purpose is the full
    // workout history log.
    getWorkoutSessions()
      .then(setSessions)
      .catch(() => {
        setLoadError("Couldn't load workout history — try reloading.");
      });
  }, []);

  return (
    <div>
      <TopBar title="History" />

      {loadError && (
        <p
          className="font-mono text-caption px-5 pt-1"
          style={{ color: "hsl(var(--destructive))", margin: 0 }}
        >
          {loadError}
        </p>
      )}

      <div className="px-5 pt-3.5">
        <div
          className="flex"
          style={{
            background: "hsl(var(--surface-sunken))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            padding: 3,
          }}
          role="tablist"
          aria-label="History view"
        >
          {(
            [
              ["log", "Log"],
              ["progress", "Progress"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className="flex-1 text-subtext"
              style={{
                background: view === id ? "hsl(var(--primary))" : "transparent",
                color: view === id ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                fontWeight: view === id ? 600 : 500,
                border: "none",
                borderRadius: 7,
                padding: "10px 0",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics panel — no outer horizontal padding here; HistoryAnalytics
          has its own internal padding, matching ExerciseHistoryScreen. */}
      {view === "progress" && <HistoryAnalytics />}

      <div
        className="px-5 pt-4 pb-24 flex flex-col gap-2.5"
        style={{ display: view === "log" ? undefined : "none" }}
      >

        {/* Workout list */}
        {sessions.map((session) => {
          const durationMin = Math.round((session.finishedAt - session.startedAt) / 60000);
          const volume = sessionVolume(session);
          const setCount = sessionSetCount(session);
          const hasPR = session.prs.length > 0;

          return (
            <Card
              key={session.id}
              onClick={() => setExpanded((e) => (e === session.id ? null : session.id))}
              className="cursor-pointer transition-colors"
              style={{
                borderColor: expanded === session.id ? "hsl(var(--primary) / 0.4)" : undefined,
              }}
            >
              <CardContent style={{ padding: "14px 16px" }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex gap-2 items-center mb-1">
                      <p className="font-semibold text-title">{session.templateName}</p>
                      {hasPR && (
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
                    <p className="font-mono text-caption text-muted-foreground">
                      {fmtRelativeDate(session.startedAt)} · {durationMin}m
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-sm">
                        {Number(fmtWeight(volume, unit)).toLocaleString()} {unit}
                      </p>
                      <p className="font-mono text-caption text-muted-foreground">
                        {setCount} sets
                      </p>
                    </div>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`history-chevron${expanded === session.id ? " open" : ""}`}
                    />
                  </div>
                </div>

                {expanded === session.id && (
                  <div className="mt-3.5 pt-3.5 border-t border-border">
                    {session.exercises.map((ex) => (
                      <div key={ex.name} className="mb-3">
                        <p className="font-medium text-subtext mb-1.5">{ex.name}</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {ex.sets.map((s, i) => (
                            <span key={i} className="set-chip">
                              {s.reps} × {fmtWeight(s.weight, unit)}{unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

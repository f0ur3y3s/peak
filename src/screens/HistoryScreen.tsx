import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { HistoryAnalytics } from "@/components/HistoryAnalytics";
import {
  getWorkoutSessions,
  saveWorkoutSession,
  deleteWorkoutSession,
  recomputeSessionPRs,
  sessionVolume,
  sessionSetCount,
  type WorkoutSession,
} from "@/lib/db";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SetEditor } from "@/components/SetEditor";
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkoutSession | null>(null);
  const [editing, setEditing] = useState<{
    session: WorkoutSession;
    exerciseName: string;
    setIndex: number;
  } | null>(null);

  useEffect(() => {
    // Deliberately unbounded — this screen's whole purpose is the full
    // workout history log.
    getWorkoutSessions()
      .then(setSessions)
      .catch(() => {
        setLoadError("Couldn't load workout history — try reloading.");
      });
  }, []);

  /**
   * Writes an edited session back, or removes it when its last set is gone.
   *
   * PR flags are recorded on the session at Finish, so a corrected weight
   * would otherwise leave a badge asserting a best that no longer exists —
   * and the same in reverse, a genuine best with nothing marking it.
   */
  const commit = async (next: WorkoutSession) => {
    const emptied = next.exercises.every((ex) => ex.sets.length === 0);
    setSaveError(null);
    try {
      if (emptied) {
        await deleteWorkoutSession(next.id);
        setSessions((list) => list.filter((s) => s.id !== next.id));
        return;
      }
      const withPRs = { ...next, prs: recomputeSessionPRs(next, sessions) };
      await saveWorkoutSession(withPRs);
      setSessions((list) => list.map((s) => (s.id === withPRs.id ? withPRs : s)));
    } catch {
      setSaveError("Couldn't save that change — try again.");
    }
  };

  const editSet = async (reps: number | null, weightKg: number | null) => {
    if (!editing) return;
    const { session, exerciseName, setIndex } = editing;
    setEditing(null);
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => {
          if (ex.name !== exerciseName) return ex;
          const sets =
            reps === null
              ? ex.sets.filter((_, i) => i !== setIndex)
              : ex.sets.map((s, i) => (i === setIndex ? { reps, weight: weightKg ?? s.weight } : s));
          return { ...ex, sets };
        })
        // An exercise with no sets left is not part of the workout any more.
        .filter((ex) => ex.sets.length > 0),
    };
    await commit(next);
  };

  return (
    <div>
      <TopBar title="History" />

      {loadError && (
        <p
          role="alert"
          className="font-mono text-caption px-5 pt-1"
          style={{ color: "hsl(var(--destructive))", margin: 0 }}
        >
          {loadError}
        </p>
      )}

      {saveError && (
        <p
          role="alert"
          className="font-mono text-caption px-5 pt-1"
          style={{ color: "hsl(var(--destructive))", margin: 0 }}
        >
          {saveError}
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
                padding: "13px 0",
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
                  <div
                    className="mt-3.5 pt-3.5 border-t border-border"
                    // The card itself toggles expansion; without this, every
                    // tap on a set or on Delete would also collapse the card
                    // out from under the dialog it just opened.
                    onClick={(e) => e.stopPropagation()}
                  >
                    {session.exercises.map((ex) => (
                      <div key={ex.name} className="mb-3">
                        <p className="font-medium text-subtext mb-1.5">{ex.name}</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {ex.sets.map((s, i) => (
                            <button
                              key={i}
                              className="set-chip"
                              style={{ border: "none", cursor: "pointer", font: "inherit" }}
                              onClick={() =>
                                setEditing({ session, exerciseName: ex.name, setIndex: i })
                              }
                              aria-label={`Edit ${ex.name} set ${i + 1}: ${s.reps} reps at ${fmtWeight(s.weight, unit)} ${unit}`}
                            >
                              {s.reps} × {fmtWeight(s.weight, unit)}{unit}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-caption text-muted-foreground">Tap a set to correct it</p>
                      <button
                        onClick={() => setDeleting(session)}
                        className="text-caption"
                        style={{
                          background: "none",
                          border: "none",
                          color: "hsl(var(--destructive))",
                          cursor: "pointer",
                          padding: "10px 0 10px 16px",
                          minHeight: 44,
                        }}
                      >
                        Delete workout
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing && (
        <SetEditor
          exerciseName={editing.exerciseName}
          setNumber={editing.setIndex + 1}
          reps={
            editing.session.exercises.find((ex) => ex.name === editing.exerciseName)!.sets[
              editing.setIndex
            ].reps
          }
          weight={
            editing.session.exercises.find((ex) => ex.name === editing.exerciseName)!.sets[
              editing.setIndex
            ].weight
          }
          onSave={(reps, weightKg) => void editSet(reps, weightKg)}
          onDelete={() => void editSet(null, null)}
          onCancel={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this workout?"
          message={`${deleting.templateName} — ${sessionSetCount(deleting)} ${
            sessionSetCount(deleting) === 1 ? "set" : "sets"
          } — will be removed from your history and from every chart. This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            setSaveError(null);
            deleteWorkoutSession(target.id)
              .then(() => setSessions((list) => list.filter((s) => s.id !== target.id)))
              .catch(() => setSaveError("Couldn't delete that workout — try again."));
          }}
        />
      )}
    </div>
  );
}

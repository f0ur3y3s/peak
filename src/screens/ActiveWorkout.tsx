import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/TopBar";
import { ExerciseCard } from "@/components/ExerciseCard";
import { TimerSheet } from "@/components/TimerSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExercisePicker } from "@/components/ExercisePicker";
import { ExerciseConfigEditor, type ExerciseConfigValues } from "@/components/ExerciseConfigEditor";
import { WorkoutSummary } from "@/screens/WorkoutSummary";
import { fmtTime, type Exercise, type TimerState } from "@/lib/data";
import {
  getExercises,
  getTemplate,
  saveTemplate,
  saveWorkoutSession,
  getPR,
  getActiveWorkoutDraft,
  saveActiveWorkoutDraft,
  clearActiveWorkoutDraft,
  lastSetsFor,
  type WorkoutSession,
  type LibraryExercise,
} from "@/lib/db";

const DEFAULT_CONFIG: ExerciseConfigValues = {
  targetSets: 4,
  repsMin: 6,
  repsMax: 8,
  targetWeight: 20,
  restSeconds: 90,
};

interface ActiveWorkoutProps {
  templateId: string;
  onBack: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

export function ActiveWorkout({ templateId, onBack, onFinish, onDiscard }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [addingExercise, setAddingExercise] = useState<LibraryExercise | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getActiveWorkoutDraft().then((draft) => {
      const resumeDraft = draft && draft.templateId === templateId ? draft : undefined;
      if (resumeDraft) startedAt.current = resumeDraft.startedAt;

      getExercises(templateId)
        .then((exs) => {
          let hydrated = exs;
          if (resumeDraft) {
            const loggedByExerciseId = new Map(
              resumeDraft.exercises.map((e) => [e.exerciseId, e.logged])
            );
            // Note: if an exercise was removed from the template after the draft was
            // saved, getExercises won't return it, so any logged sets for that
            // exercise have nothing to attach to and are silently dropped here.
            // Known, accepted edge case — not handled.
            hydrated = exs.map((ex) => ({
              ...ex,
              logged: loggedByExerciseId.get(ex.id) ?? ex.logged,
            }));
          }
          setExercises(hydrated);
          if (hydrated.length > 0) setActiveId(hydrated[0].id);
        })
        .catch(() => setLoadError("Couldn't load exercises — try reloading."));
    });
    getTemplate(templateId).then((t) => setTemplateName(t?.name ?? "Workout"));
  }, [templateId]);

  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleLog = (exId: string, reps: number, weight: number) => {
    let restSeconds = 120;
    let exerciseName = "";
    let nextSet = "";

    const updatedExercises = exercises.map((ex) => {
      if (ex.id !== exId) return ex;
      const newLogged = [...ex.logged, { id: `s${Date.now()}`, reps, weight }];
      restSeconds = ex.restSeconds;
      exerciseName = ex.name;
      const setsLeft = ex.targetSets - newLogged.length;
      nextSet =
        setsLeft > 0
          ? `Set ${newLogged.length + 1} of ${ex.targetSets}`
          : "Last set done";
      return { ...ex, logged: newLogged };
    });

    setExercises(updatedExercises);
    setTimer({ seconds: restSeconds, exerciseName, nextSet });
    setDraftError(null);

    saveActiveWorkoutDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged })),
    }).catch(() => setDraftError("Couldn't save progress — check your connection."));
  };

  const handleDeleteSet = (exId: string, setId: string) => {
    const updatedExercises = exercises.map((ex) =>
      ex.id === exId ? { ...ex, logged: ex.logged.filter((s) => s.id !== setId) } : ex
    );

    setExercises(updatedExercises);
    setDraftError(null);

    saveActiveWorkoutDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged })),
    }).catch(() => setDraftError("Couldn't save progress — check your connection."));
  };

  const handleUpdateRest = (exId: string, restSeconds: number) => {
    // Deliberately local-only: this does not persist to the template until
    // Finish, so an abandoned/discarded workout never touches the template.
    setExercises((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, restSeconds } : ex))
    );
  };

  const handleAddExercise = async (values: ExerciseConfigValues) => {
    if (!addingExercise) return;
    const last = await lastSetsFor(addingExercise.name).catch(() => null);
    const newExercise: Exercise = {
      id: addingExercise.id,
      name: addingExercise.name,
      muscle: addingExercise.muscle,
      ...values,
      last,
      logged: [],
    };
    const updatedExercises = [...exercises, newExercise];
    setExercises(updatedExercises);
    setActiveId(newExercise.id);
    setAddingExercise(null);
    setDraftError(null);

    // Note: a newly-added exercise isn't part of the template yet (that only
    // happens at Finish, see handleFinish), so if the app reloads before this
    // workout finishes, getExercises(templateId) won't return it and this
    // addition — along with any sets logged for it — is lost. Known, accepted
    // edge case, same as the removed-from-template case noted above.
    saveActiveWorkoutDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged })),
    }).catch(() => setDraftError("Couldn't save progress — check your connection."));
  };

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setFinishError(null);
    try {
      const loggedExercises = exercises.filter((ex) => ex.logged.length > 0);

      const prs: string[] = [];
      for (const ex of loggedExercises) {
        const previousBest = await getPR(ex.name);
        const bestThisSession = Math.max(...ex.logged.map((s) => s.weight));
        if (bestThisSession > previousBest) prs.push(ex.name);
      }

      const built: WorkoutSession = {
        id: crypto.randomUUID(),
        templateId,
        templateName: templateName || "Workout",
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        exercises: loggedExercises.map((ex) => ({
          name: ex.name,
          sets: ex.logged.map((s) => ({ reps: s.reps, weight: s.weight })),
        })),
        prs,
        updatedAt: Date.now(),
      };

      await saveWorkoutSession(built);

      // Sync any rest-duration or set-count changes made during this workout
      // back to the template, now that the workout is actually complete —
      // deferred rather than writing on every change so an abandoned/discarded
      // workout never touches the template.
      try {
        const template = await getTemplate(templateId);
        if (template) {
          const existingIds = new Set(template.exercises.map((cfg) => cfg.exerciseId));
          const newConfigs = loggedExercises
            .filter((ex) => !existingIds.has(ex.id))
            .map((ex, i) => ({
              exerciseId: ex.id,
              order: template.exercises.length + i,
              targetSets: ex.logged.length,
              repsMin: ex.repsMin,
              repsMax: ex.repsMax,
              targetWeight: ex.targetWeight,
              restSeconds: ex.restSeconds,
            }));
          const updatedTemplate = {
            ...template,
            exercises: [
              ...template.exercises.map((cfg) => {
                const match = exercises.find((ex) => ex.id === cfg.exerciseId);
                if (!match) return cfg;
                return {
                  ...cfg,
                  targetSets: match.logged.length > 0 ? match.logged.length : cfg.targetSets,
                  restSeconds: match.restSeconds,
                };
              }),
              ...newConfigs,
            ],
          };
          await saveTemplate(updatedTemplate);
        }
      } catch {
        // best-effort; the workout session itself already saved successfully above
      }

      // Best-effort: retry once before giving up. If the draft clear still fails,
      // the user still proceeds to the summary — the real save above already
      // succeeded, and surfacing an error here would be misleading.
      await clearActiveWorkoutDraft().catch(() => clearActiveWorkoutDraft().catch(() => {}));
      setSession(built);
    } catch {
      setFinishError("Couldn't save workout — try again.");
    } finally {
      setIsFinishing(false);
    }
  };

  const handleDiscard = async () => {
    try {
      await clearActiveWorkoutDraft();
    } catch {
      // best-effort — still navigate away regardless of whether the clear succeeded
    }
    onDiscard();
  };

  if (session) {
    return <WorkoutSummary session={session} onDone={onFinish} />;
  }

  const totalLogged = exercises.reduce((a, e) => a + e.logged.length, 0);
  const totalTarget = exercises.reduce((a, e) => a + Math.max(e.targetSets, e.logged.length), 0);

  return (
    <>
      {timer && <TimerSheet timer={timer} onClose={() => setTimer(null)} />}

      <div>
        <TopBar
          title={templateName || "Workout"}
          sub={`${fmtTime(elapsed)} · ${totalLogged}/${totalTarget} sets`}
          onBack={onBack}
          right={
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={() => setConfirmingDiscard(true)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  padding: "4px 8px",
                }}
              >
                Discard
              </button>
              <Button
                variant="outline"
                className="text-[13px] text-muted-foreground"
                onClick={handleFinish}
                disabled={isFinishing}
              >
                {isFinishing ? "Finishing…" : "Finish"}
              </Button>
            </div>
          }
        />

        {loadError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {loadError}
          </p>
        )}

        {finishError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {finishError}
          </p>
        )}

        {draftError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {draftError}
          </p>
        )}

        {/* Global progress bar */}
        <div className="px-5 pt-2.5">
          <Progress value={totalTarget > 0 ? (totalLogged / totalTarget) * 100 : 0} className="h-[3px]" />
        </div>

        <div className="px-5 pt-3.5 pb-28 flex flex-col gap-3">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              isActive={activeId === ex.id}
              onActivate={setActiveId}
              onLogSet={handleLog}
              onDeleteSet={handleDeleteSet}
              onUpdateRest={handleUpdateRest}
            />
          ))}

          <Button
            variant="outline"
            className="text-muted-foreground rounded-xl h-auto py-4"
            style={{ border: "1px dashed hsl(var(--border))" }}
            onClick={() => setPickingExercise(true)}
          >
            + Add exercise
          </Button>
        </div>
      </div>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard workout"
          message="Discard this workout? Your logged sets will be lost."
          onConfirm={() => {
            setConfirmingDiscard(false);
            handleDiscard();
          }}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}

      {pickingExercise && (
        <ExercisePicker
          existingExerciseIds={exercises.map((ex) => ex.id)}
          onPick={(libraryExercise) => {
            setPickingExercise(false);
            setAddingExercise(libraryExercise);
          }}
          onCancel={() => setPickingExercise(false)}
        />
      )}

      {addingExercise && (
        <ExerciseConfigEditor
          exerciseName={addingExercise.name}
          initial={DEFAULT_CONFIG}
          onSave={handleAddExercise}
          onCancel={() => setAddingExercise(null)}
        />
      )}
    </>
  );
}

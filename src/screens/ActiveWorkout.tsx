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
import { primeRestAlert } from "@/lib/restAlert";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";
import { useWakeLock } from "@/lib/useWakeLock";
import { scheduleRestPush, cancelRestPush } from "@/lib/restPush";
import {
  getExercises,
  getTemplate,
  saveTemplate,
  saveWorkoutSession,
  getPR,
  getActiveWorkoutDraft,
  saveActiveWorkoutDraft,
  type ActiveWorkoutDraft,
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
  onBackToTemplates: () => void;
}

export function ActiveWorkout({ templateId, onBack, onFinish, onDiscard, onBackToTemplates }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [templateUpdates, setTemplateUpdates] = useState<string[]>([]);
  const [finishError, setFinishError] = useState<string | null>(null);
  // Monotonic id of the most recent draft save, so a slow failure from an
  // earlier save cannot raise an error banner over a newer save that worked.
  const draftSaveSeq = useRef(0);
  // Rest times the user actually changed during this workout. The draft
  // persists a restSeconds for every exercise, and on resume that value wins
  // over the template's — so writing all of them back at Finish silently
  // reverted any rest edit made in the template while the draft was open, and
  // reported the reversal on the Summary as if the user had made it.
  const restEdited = useRef<Set<string>>(new Set());
  const { unit } = useWeightUnit();
  // Spoken confirmation of the things this screen does silently. Everything
  // here is visual feedback — a pip fills, the set list grows, the progress
  // bar moves — none of which a screen reader reports, so logging a set gave
  // no confirmation that anything had happened at all.
  const [announcement, setAnnouncement] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // A workout is minutes of standing still between ten-second bursts of
  // typing, so the phone locks between every set — Face ID or a passcode with
  // chalk on your hands, forty times a session. Held only while sets are
  // being logged: the summary that follows is read once and put away.
  useWakeLock(!session);

  // The rest alert, for the case the page cannot serve: backgrounded, and on
  // iOS frozen outright. Scheduled on the way out and cancelled on the way
  // back, so a push only ever exists while nobody is watching the countdown —
  // which is also what stops it arriving on top of the in-app alert.
  //
  // Keyed on the timer object, so re-backgrounding during a later rest
  // reschedules for that rest's deadline rather than the first one's.
  useEffect(() => {
    if (!timer) return;
    const endsAt = Date.now() + timer.seconds * 1000;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const left = endsAt - Date.now();
        // Under a couple of seconds there is no point: the push cannot be
        // scheduled, delivered and shown before the rest is already over.
        if (left < 2_000) return;
        scheduleRestPush(endsAt, "Rest complete", `Next set — ${timer.exerciseName}`);
      } else {
        cancelRestPush();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      // Closing the sheet, logging the next set, or leaving the workout all
      // land here: whatever was pending is no longer wanted.
      cancelRestPush();
    };
  }, [timer]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [addingExercise, setAddingExercise] = useState<LibraryExercise | null>(null);
  const startedAt = useRef(Date.now());
  // Mirrors `exercises` but updated synchronously (not via a setState
  // functional-updater read-back — that's not guaranteed to run before this
  // function returns). Handlers read/write this instead of the closed-over
  // `exercises` state variable so two handlers firing back-to-back (before a
  // re-render lands) each see the other's change instead of clobbering it.
  const exercisesRef = useRef<Exercise[]>([]);

  const applyExercises = (updated: Exercise[]) => {
    exercisesRef.current = updated;
    setExercises(updated);
  };

  useEffect(() => {
    getActiveWorkoutDraft().catch(() => undefined).then((draft) => {
      const resumeDraft = draft && draft.templateId === templateId ? draft : undefined;
      if (resumeDraft) startedAt.current = resumeDraft.startedAt;

      getExercises(templateId)
        .then((exs) => {
          let hydrated = exs;
          if (resumeDraft) {
            // Note: if an exercise was removed from the template after the draft was
            // saved, getExercises won't return it, so any logged sets for that
            // exercise have nothing to attach to and are silently dropped here.
            // Known, accepted edge case — not handled.
            // Draft order, not template order: "Do later" reorders the
            // session, and mapping over the template's order on resume would
            // silently undo that. Anything in the template but absent from
            // the draft (added to the template while this workout was open)
            // follows, in template order.
            const remaining = new Map(exs.map((ex) => [ex.id, ex]));
            const ordered: Exercise[] = [];
            for (const draftEx of resumeDraft.exercises) {
              const ex = remaining.get(draftEx.exerciseId);
              if (!ex) continue;
              remaining.delete(draftEx.exerciseId);
              ordered.push({
                ...ex,
                logged: draftEx.logged ?? ex.logged,
                restSeconds: draftEx.restSeconds ?? ex.restSeconds,
              });
            }
            hydrated = [...ordered, ...exs.filter((ex) => remaining.has(ex.id))];
          }
          applyExercises(hydrated);

          // Resuming used to open on exercise 1 even with the first four
          // complete, so you had to scroll and tap back to where you were.
          const firstUnfinished = hydrated.find((e) => e.logged.length < e.targetSets);
          if (firstUnfinished) setActiveId(firstUnfinished.id);
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
    // Every rest period begins here, and mobile browsers only let an
    // AudioContext start inside a user gesture — so this tap is the only
    // moment the rest alert can be made audible at all.
    primeRestAlert();

    let restSeconds = 120;
    let exerciseName = "";
    let nextSet = "";

    const updatedExercises = exercisesRef.current.map((ex) => {
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

    applyExercises(updatedExercises);
    setTimer({ seconds: restSeconds, exerciseName, nextSet });
    setDraftError(null);
    const logged = updatedExercises.find((ex) => ex.id === exId)?.logged.length ?? 0;
    setAnnouncement(
      `Logged set ${logged} of ${exerciseName}: ${reps} reps at ${fmtWeight(weight, unit)} ${unit}. Resting ${fmtTime(restSeconds)}.`
    );

    persistDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged, restSeconds: ex.restSeconds })),
    });
  };

  const handleDeleteSet = (exId: string, setId: string) => {
    const updatedExercises = exercisesRef.current.map((ex) =>
      ex.id === exId ? { ...ex, logged: ex.logged.filter((s) => s.id !== setId) } : ex
    );

    applyExercises(updatedExercises);
    setDraftError(null);
    setAnnouncement("Set removed.");

    persistDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged, restSeconds: ex.restSeconds })),
    });
  };

  /**
   * Persists the draft, reporting failure only while it is still the newest
   * save in flight. Previously every save set the banner from its own async
   * catch with no ordering: log set 1 (save A), log set 2 (save B, clears the
   * banner), A rejects late — and "Couldn't save progress" stayed pinned for
   * the rest of the workout even though the draft on disk was complete and
   * current, which invites the user to re-log sets that were in fact saved.
   */
  const persistDraft = (draft: Omit<ActiveWorkoutDraft, "updatedAt">) => {
    const seq = ++draftSaveSeq.current;
    saveActiveWorkoutDraft(draft).then(
      () => {
        if (seq === draftSaveSeq.current) setDraftError(null);
      },
      () => {
        if (seq === draftSaveSeq.current) {
          setDraftError("Couldn't save progress — check your connection.");
        }
      }
    );
  };

  const handleUpdateRest = (exId: string, restSeconds: number) => {
    restEdited.current.add(exId);
    // Persisted to the draft (so a mid-workout reload doesn't lose the
    // adjustment) but not to the template — that only happens at Finish,
    // so an abandoned/discarded workout never touches the template.
    const updatedExercises = exercisesRef.current.map((ex) =>
      ex.id === exId ? { ...ex, restSeconds } : ex
    );

    applyExercises(updatedExercises);
    setDraftError(null);

    persistDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged, restSeconds: ex.restSeconds })),
    });
  };

  /**
   * Sends an exercise to the end of the session. Deliberately session-only:
   * doing squats later because the rack was busy says nothing about how the
   * program should be ordered, so unlike rest changes and added exercises
   * this never reaches the template at Finish. It does persist to the draft,
   * so a reload mid-session keeps the order you are actually working in.
   */
  const handleDoLater = (exId: string) => {
    const current = exercisesRef.current;
    const moved = current.find((ex) => ex.id === exId);
    if (!moved || current.length < 2) return;
    const updatedExercises = [...current.filter((ex) => ex.id !== exId), moved];

    applyExercises(updatedExercises);

    // Hand the user the next thing to actually do, rather than leaving the
    // deferred exercise selected at the bottom of the list.
    const nextUp = updatedExercises.find(
      (ex) => ex.id !== exId && ex.logged.length < ex.targetSets
    );
    if (nextUp) setActiveId(nextUp.id);
    setAnnouncement(
      `${moved.name} moved to the end.${nextUp ? ` Now on ${nextUp.name}.` : ""}`
    );

    persistDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged, restSeconds: ex.restSeconds })),
    });
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
    const updatedExercises = [...exercisesRef.current, newExercise];
    applyExercises(updatedExercises);
    setActiveId(newExercise.id);
    setAddingExercise(null);
    setDraftError(null);

    // Note: a newly-added exercise isn't part of the template yet (that only
    // happens at Finish, see handleFinish), so if the app reloads before this
    // workout finishes, getExercises(templateId) won't return it and this
    // addition — along with any sets logged for it — is lost. Known, accepted
    // edge case, same as the removed-from-template case noted above.
    persistDraft({
      id: "current",
      templateId,
      templateName: templateName || "Workout",
      startedAt: startedAt.current,
      exercises: updatedExercises.map((ex) => ({ exerciseId: ex.id, logged: ex.logged, restSeconds: ex.restSeconds })),
    });
  };

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setFinishError(null);
    try {
      const loggedExercises = exercisesRef.current.filter((ex) => ex.logged.length > 0);

      // Finishing with nothing logged used to save a 0-set, 0-volume session
      // that could never be deleted (there is no delete-session UI), and which
      // then drove "last performed" and Quick Start. It also cleared the draft
      // — so on the error path, where exercises never loaded, tapping Finish
      // destroyed a draft holding real sets. Say so instead.
      if (loggedExercises.length === 0) {
        setFinishError("Log at least one set before finishing — or tap Discard to throw this workout away.");
        setIsFinishing(false);
        return;
      }

      // Each getPR() is an independent read — run them concurrently rather
      // than one at a time, since a workout can log several exercises.
      const prChecks = await Promise.all(
        loggedExercises.map(async (ex) => {
          const previousBest = await getPR(ex.name);
          const bestThisSession = Math.max(...ex.logged.map((s) => s.weight));
          return bestThisSession > previousBest ? ex.name : null;
        })
      );
      const prs = prChecks.filter((name): name is string => name !== null);

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
      // workout never touches the template. This mutates the template with no
      // confirmation prompt (Finish is the "casual, forward-moving" action),
      // so any actual change is collected into templateUpdates and surfaced
      // on the Summary screen instead — silent but not invisible.
      const updates: string[] = [];
      try {
        const template = await getTemplate(templateId);
        if (template) {
          const existingIds = new Set(template.exercises.map((cfg) => cfg.exerciseId));
          const newConfigs = loggedExercises
            .filter((ex) => !existingIds.has(ex.id))
            .map((ex, i) => {
              updates.push(`Added ${ex.name} to the template`);
              return {
                exerciseId: ex.id,
                order: template.exercises.length + i,
                targetSets: ex.logged.length,
                repsMin: ex.repsMin,
                repsMax: ex.repsMax,
                targetWeight: ex.targetWeight,
                restSeconds: ex.restSeconds,
              };
            });
          const updatedTemplate = {
            ...template,
            exercises: [
              ...template.exercises.map((cfg) => {
                const match = exercisesRef.current.find((ex) => ex.id === cfg.exerciseId);
                if (!match) return cfg;
                // Only raise the target when extra sets were logged beyond
                // the plan — logging fewer than planned (a lighter day,
                // cut short, etc.) must never silently lower the template's
                // default for future workouts.
                const nextTargetSets = Math.max(cfg.targetSets, match.logged.length);
                if (nextTargetSets > cfg.targetSets) {
                  updates.push(`${match.name}: target raised from ${cfg.targetSets} to ${nextTargetSets} sets`);
                }
                const restChangedHere =
                  restEdited.current.has(cfg.exerciseId) && match.restSeconds !== cfg.restSeconds;
                if (restChangedHere) {
                  updates.push(`${match.name}: rest changed to ${fmtTime(match.restSeconds)}`);
                }
                return {
                  ...cfg,
                  targetSets: nextTargetSets,
                  // Untouched here: keep whatever the template says now, which
                  // may have been edited while this workout was in progress.
                  restSeconds: restChangedHere ? match.restSeconds : cfg.restSeconds,
                };
              }),
              ...newConfigs,
            ],
          };
          await saveTemplate(updatedTemplate);
          // Only surfaced once the save above actually succeeds — otherwise
          // Summary would claim changes that were never persisted.
          setTemplateUpdates(updates);
        }
      } catch {
        // best-effort; the workout session itself already saved successfully above.
        // templateUpdates stays [] here since we don't know what, if anything,
        // actually made it to disk.
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
    return <WorkoutSummary session={session} templateUpdates={templateUpdates} onDone={onFinish} />;
  }

  const totalLogged = exercises.reduce((a, e) => a + e.logged.length, 0);
  const totalTarget = exercises.reduce((a, e) => a + Math.max(e.targetSets, e.logged.length), 0);

  return (
    <>
      {timer && <TimerSheet timer={timer} onClose={() => setTimer(null)} />}

      {/* Visually hidden. Polite rather than assertive: a logged set is a
          confirmation, not an interruption, and the rest timer's own
          countdown announcements follow immediately behind it. */}
      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>

      <div>
        <TopBar
          title={templateName || "Workout"}
          sub={`${fmtTime(elapsed)} · ${totalLogged}/${totalTarget} sets`}
          onBack={onBack}
          breadcrumb={[{ label: "Plan", onClick: onBackToTemplates }]}
          right={
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={() => setConfirmingDiscard(true)}
                className="tap-sm text-caption"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.05em",
                  padding: "4px 8px",
                  minHeight: 44,
                }}
              >
                Discard
              </button>
              <Button
                variant="outline"
                className="text-subtext text-muted-foreground"
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
            role="alert"
            className="font-mono text-caption px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {loadError}
          </p>
        )}

        {finishError && (
          <p
            role="alert"
            className="font-mono text-caption px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {finishError}
          </p>
        )}

        {draftError && (
          <p
            role="alert"
            className="font-mono text-caption px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {draftError}
          </p>
        )}

        {/* Global progress bar */}
        <div className="px-5 pt-2.5">
          <Progress
            value={totalTarget > 0 ? (totalLogged / totalTarget) * 100 : 0}
            className="h-[3px]"
            aria-label="Workout progress"
            aria-valuetext={`${totalLogged} of ${totalTarget} sets logged`}
          />
        </div>

        <div className="px-5 pt-3.5 pb-28 flex flex-col gap-2.5">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              isActive={activeId === ex.id}
              onActivate={setActiveId}
              onLogSet={handleLog}
              onDeleteSet={handleDeleteSet}
              onUpdateRest={handleUpdateRest}
              onDoLater={handleDoLater}
              canDoLater={exercises.some(
                (other) => other.id !== ex.id && other.logged.length < other.targetSets
              )}
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
          confirmLabel="Discard"
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

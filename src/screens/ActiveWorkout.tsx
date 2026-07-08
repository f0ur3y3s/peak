import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/TopBar";
import { ExerciseCard } from "@/components/ExerciseCard";
import { TimerSheet } from "@/components/TimerSheet";
import { WorkoutSummary } from "@/screens/WorkoutSummary";
import { fmtTime, type Exercise, type TimerState } from "@/lib/data";
import { getExercises, saveWorkoutSession, getPR, type WorkoutSession } from "@/lib/db";

interface ActiveWorkoutProps {
  onBack: () => void;
  onFinish: () => void;
}

export function ActiveWorkout({ onBack, onFinish }: ActiveWorkoutProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeId, setActiveId] = useState("e1");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    getExercises().then((exs) => {
      setExercises(exs);
      if (exs.length > 0) setActiveId(exs[0].id);
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const handleLog = (exId: string, reps: number, weight: number) => {
    let restSeconds = 120;
    let exerciseName = "";
    let nextSet = "";

    setExercises((prev) =>
      prev.map((ex) => {
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
      })
    );

    setTimer({ seconds: restSeconds, exerciseName, nextSet });
  };

  const handleFinish = async () => {
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
        templateName: "Push Day A",
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        exercises: loggedExercises.map((ex) => ({
          name: ex.name,
          sets: ex.logged.map((s) => ({ reps: s.reps, weight: s.weight })),
        })),
        prs,
      };

      await saveWorkoutSession(built);
      setSession(built);
    } catch {
      setFinishError("Couldn't save workout — try again.");
    }
  };

  if (session) {
    return <WorkoutSummary session={session} onDone={onFinish} />;
  }

  const totalLogged = exercises.reduce((a, e) => a + e.logged.length, 0);
  const totalTarget = exercises.reduce((a, e) => a + e.targetSets, 0);

  return (
    <>
      {timer && <TimerSheet timer={timer} onClose={() => setTimer(null)} />}

      <div>
        <TopBar
          title="Push Day A"
          sub={`${fmtTime(elapsed)} · ${totalLogged}/${totalTarget} sets`}
          onBack={onBack}
          right={
            <Button
              variant="outline"
              className="text-[13px] text-muted-foreground"
              onClick={handleFinish}
            >
              Finish
            </Button>
          }
        />

        {finishError && (
          <p
            className="font-mono text-[11px] px-5 pt-1"
            style={{ color: "hsl(var(--destructive))", margin: 0 }}
          >
            {finishError}
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
            />
          ))}

          <Button
            variant="outline"
            className="text-muted-foreground rounded-xl h-auto py-4"
            style={{ border: "1px dashed hsl(var(--border))" }}
          >
            + Add exercise
          </Button>
        </div>
      </div>
    </>
  );
}

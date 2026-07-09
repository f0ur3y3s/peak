import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeightUnit, toDisplayWeight, toKgWeight } from "@/lib/weightUnit";

export interface ExerciseConfigValues {
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

interface ExerciseConfigEditorProps {
  exerciseName: string;
  initial: ExerciseConfigValues;
  onSave: (values: ExerciseConfigValues) => void;
  onCancel: () => void;
}

export function ExerciseConfigEditor({
  exerciseName,
  initial,
  onSave,
  onCancel,
}: ExerciseConfigEditorProps) {
  const { unit } = useWeightUnit();
  const [targetSets, setTargetSets] = useState(initial.targetSets);
  const [repsMin, setRepsMin] = useState(initial.repsMin);
  const [repsMax, setRepsMax] = useState(initial.repsMax);
  const [targetWeight, setTargetWeight] = useState(() => toDisplayWeight(initial.targetWeight, unit));
  const [restSeconds, setRestSeconds] = useState(initial.restSeconds);

  const weightStep = unit === "lb" ? 5 : 2.5;

  const fields: [string, number, (v: number) => void, number, number][] = [
    ["Sets", targetSets, setTargetSets, 1, 1],
    ["Reps min", repsMin, setRepsMin, 1, 1],
    ["Reps max", repsMax, setRepsMax, 1, 1],
    [`Weight (${unit})`, targetWeight, setTargetWeight, weightStep, 0],
    ["Rest (sec)", restSeconds, setRestSeconds, 15, 0],
  ];

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-4">{exerciseName}</p>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {fields.map(([label, val, setter, step, min]) => (
            <div key={label}>
              <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
              <div className="stepper">
                <button
                  className="stepper-btn"
                  onClick={() => setter(Math.max(min, val - step))}
                >
                  <Minus size={16} strokeWidth={2} />
                </button>
                <input
                  className="stepper-input"
                  value={val}
                  onChange={(e) => setter(Number(e.target.value) || 0)}
                />
                <button className="stepper-btn" onClick={() => setter(val + step)}>
                  <Plus size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            onClick={() =>
              onSave({
                targetSets,
                repsMin,
                repsMax,
                targetWeight: toKgWeight(targetWeight, unit),
                restSeconds,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

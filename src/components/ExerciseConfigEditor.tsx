import { useState } from "react";
import { Clock, Dumbbell, Layers, Minus, Plus, Repeat } from "lucide-react";
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

// An empty/invalid field parses to NaN, which would otherwise get stuck
// (NaN - step is still NaN) with no way to recover except retyping the
// whole value — matches the pattern in ExerciseCard's steppers.
function step(value: string, delta: number, min: number): string {
  const n = parseFloat(value);
  return String(Math.max(min, (Number.isFinite(n) ? n : 0) + delta));
}

interface StepperProps {
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
}

function Stepper({ value, onChange, onStep }: StepperProps) {
  return (
    <div className="stepper">
      <button className="stepper-btn" onClick={() => onStep(-1)} type="button">
        <Minus size={16} strokeWidth={2} />
      </button>
      <input className="stepper-input" value={value} onChange={(e) => onChange(e.target.value)} />
      <button className="stepper-btn" onClick={() => onStep(1)} type="button">
        <Plus size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

const SECTION_LABEL_STYLE = "text-[13px] font-medium text-foreground mb-2 inline-flex items-center gap-2";

export function ExerciseConfigEditor({
  exerciseName,
  initial,
  onSave,
  onCancel,
}: ExerciseConfigEditorProps) {
  const { unit } = useWeightUnit();
  const [targetSets, setTargetSets] = useState(String(initial.targetSets));
  const [repsMin, setRepsMin] = useState(String(initial.repsMin));
  const [repsMax, setRepsMax] = useState(String(initial.repsMax));
  const [targetWeight, setTargetWeight] = useState(() => String(toDisplayWeight(initial.targetWeight, unit)));
  const [restSeconds, setRestSeconds] = useState(String(initial.restSeconds));

  const weightStep = unit === "lb" ? 5 : 2.5;

  const repsMinNum = Number(repsMin);
  const repsMaxNum = Number(repsMax);
  const repsValid =
    Number.isFinite(repsMinNum) && Number.isFinite(repsMaxNum) && repsMinNum > 0 && repsMinNum <= repsMaxNum;

  const setsNum = Number(targetSets);
  const weightNum = Number(targetWeight);
  const restNum = Number(restSeconds);
  const canSave =
    repsValid &&
    Number.isFinite(setsNum) && setsNum > 0 &&
    Number.isFinite(weightNum) && weightNum >= 0 &&
    Number.isFinite(restNum) && restNum >= 0;

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[17px] mb-4">{exerciseName}</p>

        <div className="flex flex-col gap-4 mb-5">
          <div>
            <p className={SECTION_LABEL_STYLE}>
              <Layers size={15} strokeWidth={2} />
              Sets
            </p>
            <Stepper
              value={targetSets}
              onChange={setTargetSets}
              onStep={(d) => setTargetSets((v) => step(v, d, 1))}
            />
          </div>

          <div>
            <p className={SECTION_LABEL_STYLE}>
              <Repeat size={15} strokeWidth={2} />
              Reps
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[12px] text-muted-foreground mb-1.5">Min</p>
                <Stepper
                  value={repsMin}
                  onChange={setRepsMin}
                  onStep={(d) => setRepsMin((v) => step(v, d, 1))}
                />
              </div>
              <div>
                <p className="text-[12px] text-muted-foreground mb-1.5">Max</p>
                <Stepper
                  value={repsMax}
                  onChange={setRepsMax}
                  onStep={(d) => setRepsMax((v) => step(v, d, 1))}
                />
              </div>
            </div>
            {!repsValid && (
              <p className="font-mono text-[12px] mt-1.5" style={{ color: "hsl(var(--destructive))" }}>
                Min reps can't be greater than max.
              </p>
            )}
          </div>

          <div>
            <p className={SECTION_LABEL_STYLE}>
              <Dumbbell size={15} strokeWidth={2} />
              Weight ({unit})
            </p>
            <Stepper
              value={targetWeight}
              onChange={setTargetWeight}
              onStep={(d) => setTargetWeight((v) => step(v, d * weightStep, 0))}
            />
          </div>

          <div>
            <p className={SECTION_LABEL_STYLE}>
              <Clock size={15} strokeWidth={2} />
              Rest (sec)
            </p>
            <Stepper
              value={restSeconds}
              onChange={setRestSeconds}
              onStep={(d) => setRestSeconds((v) => step(v, d * 15, 0))}
            />
          </div>
        </div>

        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!canSave}
            onClick={() =>
              onSave({
                targetSets: setsNum,
                repsMin: repsMinNum,
                repsMax: repsMaxNum,
                targetWeight: toKgWeight(weightNum, unit),
                restSeconds: restNum,
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

import { useId, useState } from "react";
import { Clock, Dumbbell, Layers, Minus, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
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
  id?: string;
  /** Used only to build the +/- buttons' accessible names (e.g. "Decrease
   * Sets") — the buttons carry no visible text of their own. */
  label: string;
}

function Stepper({ value, onChange, onStep, id, label }: StepperProps) {
  return (
    <div className="stepper">
      <button className="stepper-btn" onClick={() => onStep(-1)} type="button" aria-label={`Decrease ${label}`}>
        <Minus size={16} strokeWidth={2} />
      </button>
      <input id={id} className="stepper-input" value={value} onChange={(e) => onChange(e.target.value)} />
      <button className="stepper-btn" onClick={() => onStep(1)} type="button" aria-label={`Increase ${label}`}>
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
  const titleId = useId();
  const setsId = useId();
  const repsMinId = useId();
  const repsMaxId = useId();
  const weightId = useId();
  const restId = useId();
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
    <Modal onClose={onCancel} labelledBy={titleId}>
        <h2 id={titleId} className="font-semibold text-[17px] mb-4">{exerciseName}</h2>

        <div className="flex flex-col gap-4 mb-5">
          <div>
            <label htmlFor={setsId} className={SECTION_LABEL_STYLE}>
              <Layers size={16} strokeWidth={2} aria-hidden="true" />
              Sets
            </label>
            <Stepper
              id={setsId}
              label="Sets"
              value={targetSets}
              onChange={setTargetSets}
              onStep={(d) => setTargetSets((v) => step(v, d, 1))}
            />
          </div>

          <div>
            <p className={SECTION_LABEL_STYLE}>
              <Repeat size={16} strokeWidth={2} aria-hidden="true" />
              Reps
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={repsMinId} className="block text-[12px] text-muted-foreground mb-1.5">Min</label>
                <Stepper
                  id={repsMinId}
                  label="min reps"
                  value={repsMin}
                  onChange={setRepsMin}
                  onStep={(d) => setRepsMin((v) => step(v, d, 1))}
                />
              </div>
              <div>
                <label htmlFor={repsMaxId} className="block text-[12px] text-muted-foreground mb-1.5">Max</label>
                <Stepper
                  id={repsMaxId}
                  label="max reps"
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
            <label htmlFor={weightId} className={SECTION_LABEL_STYLE}>
              <Dumbbell size={16} strokeWidth={2} aria-hidden="true" />
              Weight ({unit})
            </label>
            <Stepper
              id={weightId}
              label={`weight in ${unit}`}
              value={targetWeight}
              onChange={setTargetWeight}
              onStep={(d) => setTargetWeight((v) => step(v, d * weightStep, 0))}
            />
          </div>

          <div>
            <label htmlFor={restId} className={SECTION_LABEL_STYLE}>
              <Clock size={16} strokeWidth={2} aria-hidden="true" />
              Rest (sec)
            </label>
            <Stepper
              id={restId}
              label="rest seconds"
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
    </Modal>
  );
}

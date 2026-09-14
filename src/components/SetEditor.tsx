import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { TEXT_INPUT_STYLE } from "@/lib/inputStyles";
import { useWeightUnit, fmtWeight, toKgWeight } from "@/lib/weightUnit";

interface SetEditorProps {
  exerciseName: string;
  /** 1-based, as the set is labelled in the workout. */
  setNumber: number;
  reps: number;
  /** Stored weight, in kg. */
  weight: number;
  onSave: (reps: number, weightKg: number) => void;
  onDelete: () => void;
  onCancel: () => void;
}

/**
 * Corrects one logged set after the fact.
 *
 * A finished workout used to be immutable: a double-tapped Log, or 120 typed
 * where 20 was meant, sat in the history and skewed every chart and PR that
 * read it, permanently. Deleting the whole session to fix one number is not a
 * repair.
 */
export function SetEditor({
  exerciseName,
  setNumber,
  reps,
  weight,
  onSave,
  onDelete,
  onCancel,
}: SetEditorProps) {
  const titleId = useId();
  const { unit } = useWeightUnit();
  const [repsText, setRepsText] = useState(String(reps));
  const [weightText, setWeightText] = useState(fmtWeight(weight, unit));

  const repsValue = Number(repsText);
  const weightValue = Number(weightText);
  // Reps are whole by definition; weight is not (2.5kg plates, 0.5kg
  // micro-loading). Both must be present — a blank field saved as 0 would
  // quietly turn a real set into a zero-volume one.
  const valid =
    /^\d+$/.test(repsText.trim()) &&
    repsValue > 0 &&
    weightText.trim() !== "" &&
    Number.isFinite(weightValue) &&
    weightValue >= 0;

  return (
    <Modal onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="font-semibold text-lg mb-0.5">
        Edit set
      </h2>
      <p className="font-mono text-caption text-muted-foreground mb-5">
        {exerciseName} · set {setNumber}
      </p>

      <div className="flex gap-3 mb-5">
        <label className="flex-1">
          <span className="font-mono text-label text-muted-foreground uppercase tracking-widest">
            Reps
          </span>
          <input
            className="field-input mt-1.5"
            style={TEXT_INPUT_STYLE}
            inputMode="numeric"
            value={repsText}
            onChange={(e) => setRepsText(e.target.value)}
            aria-label="Reps"
          />
        </label>
        <label className="flex-1">
          <span className="font-mono text-label text-muted-foreground uppercase tracking-widest">
            Weight ({unit})
          </span>
          <input
            className="field-input mt-1.5"
            style={TEXT_INPUT_STYLE}
            inputMode="decimal"
            value={weightText}
            onChange={(e) => setWeightText(e.target.value)}
            aria-label={`Weight in ${unit}`}
          />
        </label>
      </div>

      <div className="flex gap-2.5 mb-2.5">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1 font-semibold"
          disabled={!valid}
          onClick={() => onSave(repsValue, toKgWeight(weightValue, unit))}
        >
          Save
        </Button>
      </div>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={onDelete}
      >
        Delete this set
      </Button>
    </Modal>
  );
}

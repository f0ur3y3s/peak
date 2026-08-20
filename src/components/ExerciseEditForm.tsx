import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { MuscleSelect } from "@/components/MuscleSelect";
import { Modal } from "@/components/Modal";
import { TEXT_INPUT_STYLE, normalizeMuscle } from "@/lib/inputStyles";

interface ExerciseEditFormProps {
  title: string;
  initialName: string;
  initialMuscle: string;
  onSave: (name: string, muscle: string) => void;
  onCancel: () => void;
}

export function ExerciseEditForm({
  title,
  initialName,
  initialMuscle,
  onSave,
  onCancel,
}: ExerciseEditFormProps) {
  const titleId = useId();
  const nameId = useId();
  const muscleId = useId();
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState(initialMuscle);

  const canSave = name.trim().length > 0;

  return (
    <Modal onClose={onCancel} labelledBy={titleId}>
        <h2 id={titleId} className="font-semibold text-[17px] mb-4">{title}</h2>
        <div className="flex flex-col gap-2.5 mb-5">
          <div>
            <label htmlFor={nameId} className="block text-[12px] text-muted-foreground mb-1.5">Name</label>
            <input
              id={nameId}
              className="field-input"
              style={TEXT_INPUT_STYLE}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor={muscleId} className="block text-[12px] text-muted-foreground mb-1.5">Muscle group</label>
            <MuscleSelect id={muscleId} value={muscle} onChange={setMuscle} />
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!canSave}
            onClick={() => onSave(name.trim(), normalizeMuscle(muscle))}
          >
            Save
          </Button>
        </div>
    </Modal>
  );
}

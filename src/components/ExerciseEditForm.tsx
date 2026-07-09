import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MuscleSelect } from "@/components/MuscleSelect";

const TEXT_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  padding: "10px 12px",
  color: "hsl(var(--foreground))",
  fontFamily: "'DM Mono', monospace",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

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
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState(initialMuscle);

  const canSave = name.trim().length > 0;

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-4">{title}</p>
        <div className="flex flex-col gap-2.5 mb-5">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Name</p>
            <input
              style={TEXT_INPUT_STYLE}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Muscle group</p>
            <MuscleSelect value={muscle} onChange={setMuscle} />
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!canSave}
            onClick={() => onSave(name.trim(), muscle.trim() || "Other")}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

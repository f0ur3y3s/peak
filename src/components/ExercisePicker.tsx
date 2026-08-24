import { useId, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getExerciseLibrary,
  saveLibraryExercise,
  type LibraryExercise,
} from "@/lib/db";
import { MuscleSelect } from "@/components/MuscleSelect";
import { Modal } from "@/components/Modal";
import { TEXT_INPUT_STYLE, normalizeMuscle } from "@/lib/inputStyles";

interface ExercisePickerProps {
  existingExerciseIds: string[];
  onPick: (exercise: LibraryExercise) => void;
  onCancel: () => void;
}

export function ExercisePicker({
  existingExerciseIds,
  onPick,
  onCancel,
}: ExercisePickerProps) {
  const titleId = useId();
  const creatingMuscleId = useId();
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [filter, setFilter] = useState("");
  const [creatingMuscle, setCreatingMuscle] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => getExerciseLibrary().then(setLibrary);

  useEffect(() => {
    reload();
  }, []);

  const available = library.filter((ex) => !existingExerciseIds.includes(ex.id));
  const filtered = available.filter((ex) =>
    ex.name.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const exactMatch = library.some(
    (ex) => ex.name.toLowerCase() === filter.trim().toLowerCase()
  );
  const canCreate = filter.trim().length > 0 && !exactMatch;

  const handleCreate = async () => {
    setActionError(null);
    const newExercise: LibraryExercise = {
      id: crypto.randomUUID(),
      name: filter.trim(),
      muscle: normalizeMuscle(creatingMuscle),
      updatedAt: Date.now(),
    };
    try {
      await saveLibraryExercise(newExercise);
    } catch {
      setActionError("Couldn't create exercise — try again.");
      return;
    }
    onPick(newExercise);
  };

  return (
    <Modal onClose={onCancel} labelledBy={titleId}>
        <h2 id={titleId} className="font-semibold text-lg mb-3">Add exercise</h2>
        <input
          className="field-input"
          style={{ ...TEXT_INPUT_STYLE, marginBottom: 12 }}
          placeholder="Search or create exercise"
          aria-label="Search or create exercise"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />

        {actionError && (
          <p
            className="font-mono text-caption mb-2"
            style={{ color: "hsl(var(--destructive))" }}
          >
            {actionError}
          </p>
        )}

        <div
          className="flex flex-col gap-1.5 mb-4"
          style={{ maxHeight: 240, overflowY: "auto" }}
        >
          {filtered.map((ex) => (
            <button
              key={ex.id}
              className="exercise-picker-row"
              onClick={() => onPick(ex)}
            >
              <span className="text-body">{ex.name}</span>
              <Badge
                variant="secondary"
                className="text-label"
                style={{ padding: "1px 7px" }}
              >
                {ex.muscle}
              </Badge>
            </button>
          ))}
          {filtered.length === 0 && !canCreate && (
            <p className="text-subtext text-muted-foreground italic">No exercises found</p>
          )}
        </div>

        {canCreate && (
          <div className="mb-4">
            <label htmlFor={creatingMuscleId} className="block text-caption text-muted-foreground mb-1.5">
              Create "{filter.trim()}" — muscle group
            </label>
            <MuscleSelect id={creatingMuscleId} value={creatingMuscle} onChange={setCreatingMuscle} />
          </div>
        )}

        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          {canCreate && (
            <Button className="flex-1 font-semibold" onClick={handleCreate}>
              Create & configure
            </Button>
          )}
        </div>

    </Modal>
  );
}

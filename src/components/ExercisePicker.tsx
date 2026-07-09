import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getExerciseLibrary,
  saveLibraryExercise,
  deleteLibraryExercise,
  type LibraryExercise,
} from "@/lib/db";
import { MuscleSelect } from "@/components/MuscleSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [filter, setFilter] = useState("");
  const [creatingMuscle, setCreatingMuscle] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingExercise, setDeletingExercise] = useState<LibraryExercise | null>(null);

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
      muscle: creatingMuscle.trim() || "Other",
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

  const handleDelete = async (id: string, name: string) => {
    setActionError(null);
    try {
      const result = await deleteLibraryExercise(id);
      if (result.ok) {
        reload();
      } else {
        setActionError(
          `"${name}" is used in ${result.usedIn.join(", ")} — remove it from those templates first.`
        );
      }
    } catch {
      setActionError("Couldn't delete exercise — try again.");
    }
  };

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-panel">
        <p className="font-semibold text-[15px] mb-3">Add exercise</p>
        <input
          style={{ ...TEXT_INPUT_STYLE, marginBottom: 12 }}
          placeholder="Search or create exercise"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />

        {actionError && (
          <p
            className="font-mono text-[11px] mb-2"
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
            <div key={ex.id} className="exercise-picker-row">
              <button className="exercise-picker-row-main" onClick={() => onPick(ex)}>
                <span className="text-[14px]">{ex.name}</span>
                <Badge
                  variant="secondary"
                  style={{ fontSize: 10, padding: "1px 7px" }}
                >
                  {ex.muscle}
                </Badge>
              </button>
              <button
                onClick={() => setDeletingExercise(ex)}
                style={{
                  background: "hsl(var(--destructive) / 0.1)",
                  border: "1px solid hsl(var(--destructive) / 0.3)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "hsl(var(--destructive))",
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginRight: 6,
                }}
                aria-label={`Delete ${ex.name}`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && !canCreate && (
            <p className="text-[13px] text-muted-foreground italic">No exercises found</p>
          )}
        </div>

        {canCreate && (
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Create "{filter.trim()}" — muscle group
            </p>
            <MuscleSelect value={creatingMuscle} onChange={setCreatingMuscle} />
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
      </div>

      {deletingExercise && (
        <ConfirmDialog
          title="Delete exercise"
          message={`Delete "${deletingExercise.name}"?`}
          onConfirm={() => {
            const ex = deletingExercise;
            setDeletingExercise(null);
            handleDelete(ex.id, ex.name);
          }}
          onCancel={() => setDeletingExercise(null)}
        />
      )}
    </div>
  );
}

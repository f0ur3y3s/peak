import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { TopBar } from "@/components/TopBar";
import { ExerciseEditForm } from "@/components/ExerciseEditForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MUSCLE_GROUPS, fuzzyMatch, groupForMuscle } from "@/lib/muscles";
import { PAGE_INPUT_STYLE } from "@/lib/inputStyles";
import {
  getExerciseLibrary,
  saveLibraryExercise,
  deleteLibraryExercise,
  type LibraryExercise,
} from "@/lib/db";

const GROUP_ORDER = [...MUSCLE_GROUPS.map((g) => g.group), "Other"];

export function ExercisesScreen() {
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingExercise, setEditingExercise] = useState<LibraryExercise | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deletingExercise, setDeletingExercise] = useState<LibraryExercise | null>(null);

  const reload = () => getExerciseLibrary().then(setLibrary);

  useEffect(() => {
    reload();
  }, []);

  const filtered = library.filter((ex) => fuzzyMatch(search, ex.name));

  const sections = GROUP_ORDER.map((group) => ({
    group,
    exercises: filtered.filter((ex) => groupForMuscle(ex.muscle) === group),
  })).filter((s) => s.exercises.length > 0);

  const handleCreate = async (name: string, muscle: string) => {
    setActionError(null);
    const exercise: LibraryExercise = { id: crypto.randomUUID(), name, muscle, updatedAt: Date.now() };
    try {
      await saveLibraryExercise(exercise);
      setCreating(false);
      reload();
    } catch {
      setActionError("Couldn't create exercise — try again.");
    }
  };

  const handleEditSave = async (name: string, muscle: string) => {
    if (!editingExercise) return;
    setActionError(null);
    try {
      await saveLibraryExercise({ ...editingExercise, name, muscle });
      setEditingExercise(null);
      reload();
    } catch {
      setActionError("Couldn't update exercise — try again.");
    }
  };

  const handleDelete = async (ex: LibraryExercise) => {
    setActionError(null);
    try {
      const result = await deleteLibraryExercise(ex.id);
      if (result.ok) {
        reload();
      } else {
        setActionError(
          `"${ex.name}" is used in ${result.usedIn.join(", ")} — remove it from those templates first.`
        );
      }
    } catch {
      setActionError("Couldn't delete exercise — try again.");
    }
  };

  return (
    <div>
      <TopBar
        title="Exercise Library"
        right={
          <button
            onClick={() => setCreating(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--primary))",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Add exercise"
          >
            <Plus size={20} strokeWidth={2} />
          </button>
        }
      />

      {actionError && (
        <p
          className="font-mono text-[11px] px-5 pt-1"
          style={{ color: "hsl(var(--destructive))", margin: 0 }}
        >
          {actionError}
        </p>
      )}

      <div className="px-5 pt-4">
        <input
          style={PAGE_INPUT_STYLE}
          placeholder="Search exercises"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="px-5 pt-4 pb-24 flex flex-col gap-4">
        {library.length === 0 ? (
          <div className="pt-10 text-center">
            <p className="text-muted-foreground text-sm">No exercises yet — tap + to add one</p>
          </div>
        ) : sections.length === 0 ? (
          <div className="pt-10 text-center">
            <p className="text-muted-foreground text-sm">No exercises match "{search}"</p>
          </div>
        ) : (
          sections.map(({ group, exercises }) => (
            <div key={group} className="flex flex-col gap-2.5">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                {group}
              </p>
              {exercises.map((ex) => (
                <Card key={ex.id} onClick={() => setEditingExercise(ex)} className="cursor-pointer">
                  <CardContent
                    style={{ padding: "14px 16px" }}
                    className="flex justify-between items-center"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[15px]">{ex.name}</p>
                      <Badge
                        variant="secondary"
                        style={{ fontSize: 10, padding: "1px 7px" }}
                      >
                        {ex.muscle}
                      </Badge>
                    </div>
                    <IconButton
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingExercise(ex);
                      }}
                      aria-label={`Delete ${ex.name}`}
                    >
                      <X size={16} strokeWidth={2} />
                    </IconButton>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))
        )}
      </div>

      {creating && (
        <ExerciseEditForm
          title="New exercise"
          initialName=""
          initialMuscle=""
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingExercise && (
        <ExerciseEditForm
          title="Edit exercise"
          initialName={editingExercise.name}
          initialMuscle={editingExercise.muscle}
          onSave={handleEditSave}
          onCancel={() => setEditingExercise(null)}
        />
      )}

      {deletingExercise && (
        <ConfirmDialog
          title="Delete exercise"
          message={`Delete "${deletingExercise.name}"?`}
          onConfirm={() => {
            const ex = deletingExercise;
            setDeletingExercise(null);
            handleDelete(ex);
          }}
          onCancel={() => setDeletingExercise(null)}
        />
      )}
    </div>
  );
}

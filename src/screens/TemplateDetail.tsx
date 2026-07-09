import { useState, useEffect, useRef } from "react";
import { Clock, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TopBar } from "@/components/TopBar";
import { ExerciseConfigEditor, type ExerciseConfigValues } from "@/components/ExerciseConfigEditor";
import { ExercisePicker } from "@/components/ExercisePicker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fmtTime, type Exercise } from "@/lib/data";
import { fmtRelativeDate } from "@/lib/utils";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";
import {
  getTemplate,
  getExercises,
  getWorkoutSessions,
  saveTemplate,
  deleteTemplate,
  getActiveWorkoutDraft,
  type Template,
  type LibraryExercise,
} from "@/lib/db";

interface TemplateDetailProps {
  templateId: string;
  onStart: () => void;
  onBack: () => void;
  onViewExerciseHistory: (exerciseName: string) => void;
}

const DEFAULT_CONFIG: ExerciseConfigValues = {
  targetSets: 4,
  repsMin: 6,
  repsMax: 8,
  targetWeight: 20,
  restSeconds: 90,
};

const RENAME_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--card))",
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

export function TemplateDetail({
  templateId,
  onStart,
  onBack,
  onViewExerciseHistory,
}: TemplateDetailProps) {
  const { unit } = useWeightUnit();
  const [template, setTemplate] = useState<Template | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingExisting, setEditingExisting] = useState<{ exerciseId: string; name: string } | null>(null);
  const [addingNew, setAddingNew] = useState<LibraryExercise | null>(null);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const autoEditApplied = useRef(false);

  const reload = () => {
    getTemplate(templateId).then((t) => setTemplate(t ?? null));
    getExercises(templateId).then(setExercises);
  };

  useEffect(() => {
    reload();
    autoEditApplied.current = false;
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    if (template.exercises.length === 0 && !autoEditApplied.current) {
      setEditMode(true);
      autoEditApplied.current = true;
    }
    getWorkoutSessions().then((sessions) => {
      const match =
        sessions.find((s) => s.templateId === templateId) ??
        sessions.find((s) => !s.templateId && s.templateName === template.name);
      setLastPerformed(match ? fmtRelativeDate(match.startedAt) : null);
    });
  }, [template]);

  if (!template) return null;

  const totalTargetSets = exercises.reduce((a, e) => a + e.targetSets, 0);
  // Sum of restSeconds × targetSets across all exercises — total time spent
  // resting for the whole template, not a per-exercise average.
  const totalRestSeconds = exercises.reduce((a, e) => a + e.restSeconds * e.targetSets, 0);

  const handleRename = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === template.name) return;
    setActionError(null);
    const previous = template;
    const updated = { ...template, name: trimmed };
    setTemplate(updated);
    try {
      await saveTemplate(updated);
    } catch {
      setTemplate(previous);
      setActionError("Couldn't rename template — try again.");
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    setActionError(null);
    const updated: Template = {
      ...template,
      exercises: template.exercises
        .filter((e) => e.exerciseId !== exerciseId)
        .map((e, i) => ({ ...e, order: i })),
    };
    try {
      await saveTemplate(updated);
    } catch {
      setActionError("Couldn't update template — try again.");
    } finally {
      reload();
    }
  };

  const handleSaveConfig = async (exerciseId: string, values: ExerciseConfigValues) => {
    setActionError(null);
    const exists = template.exercises.some((e) => e.exerciseId === exerciseId);
    const updated: Template = {
      ...template,
      exercises: exists
        ? template.exercises.map((e) =>
            e.exerciseId === exerciseId ? { ...e, ...values } : e
          )
        : [...template.exercises, { exerciseId, order: template.exercises.length, ...values }],
    };
    try {
      await saveTemplate(updated);
    } catch {
      setActionError("Couldn't update template — try again.");
    } finally {
      setEditingExisting(null);
      setAddingNew(null);
      reload();
    }
  };

  const handleDeleteTemplate = async () => {
    setActionError(null);
    try {
      await deleteTemplate(templateId);
      onBack();
    } catch {
      setActionError("Couldn't delete template — try again.");
      reload();
    }
  };

  const handleStartClick = async () => {
    setActionError(null);
    const draft = await getActiveWorkoutDraft();
    if (draft && draft.templateId !== templateId) {
      setActionError(`Finish or discard your ${draft.templateName} workout first.`);
      return;
    }
    onStart();
  };

  const editingExistingConfig: ExerciseConfigValues | undefined = editingExisting
    ? template.exercises.find((e) => e.exerciseId === editingExisting.exerciseId)
    : undefined;

  return (
    <div>
      <TopBar
        title={template.name}
        sub={lastPerformed ? `Last performed ${lastPerformed}` : "Never performed"}
        onBack={onBack}
        right={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {!editMode && (
              <Button
                onClick={handleStartClick}
                disabled={exercises.length === 0}
                className="font-semibold tracking-tight"
              >
                Start
              </Button>
            )}
          </div>
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

      {editMode && (
        <div className="px-5 pt-3 flex flex-col gap-2.5">
          <input
            style={RENAME_INPUT_STYLE}
            defaultValue={template.name}
            onBlur={(e) => handleRename(e.target.value)}
          />
          <Button variant="destructive" className="w-full" onClick={() => setConfirmingDelete(true)}>
            Delete template
          </Button>
        </div>
      )}

      {exercises.length === 0 && !editMode ? (
        <div className="px-5 pt-10 text-center">
          <p className="text-muted-foreground text-sm">No exercises yet — tap + Add exercise</p>
        </div>
      ) : (
        <>
          {exercises.length > 0 && (
            <div className="px-5 pt-4">
              <Card>
                <CardContent style={{ padding: "16px 20px" }} className="flex gap-7">
                  {(
                    [
                      [String(exercises.length), "exercises"],
                      [String(totalTargetSets), "total sets"],
                      [`~${Math.round(totalRestSeconds / 60)}`, "min rest"],
                    ] as const
                  ).map(([v, l]) => (
                    <div key={l}>
                      <p className="font-mono text-2xl font-medium">{v}</p>
                      <p className="text-[11px] text-muted-foreground mt-px">{l}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="px-5 pt-3.5 pb-2 flex flex-col gap-2.5">
            {exercises.map((ex, i) => (
              <Card
                key={ex.id}
                onClick={() =>
                  editMode
                    ? setEditingExisting({ exerciseId: ex.id, name: ex.name })
                    : onViewExerciseHistory(ex.name)
                }
                style={{ cursor: "pointer" }}
              >
                <CardHeader style={{ padding: "14px 16px 10px" }}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground min-w-[20px]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="font-semibold text-[15px]">{ex.name}</p>
                        <div className="flex gap-1.5 items-center mt-1">
                          <Badge
                            variant="secondary"
                            style={{ fontSize: 10, padding: "1px 7px" }}
                          >
                            {ex.muscle}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <Clock size={12} strokeWidth={2} />
                            {fmtTime(ex.restSeconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <p className="font-mono text-sm">
                          {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                          @ {fmtWeight(ex.targetWeight, unit)} {unit}
                        </p>
                      </div>
                      {editMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteExercise(ex.id);
                          }}
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
                          }}
                          aria-label="Delete exercise"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent style={{ padding: "12px 16px" }}>
                  {ex.last ? (
                    <>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
                        Last session
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {ex.last.map((s, j) => (
                          <span key={j} className="set-chip">
                            {s.r}×{fmtWeight(s.w, unit)}{unit}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="font-mono text-[11px] text-muted-foreground italic">
                      No previous data
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {editMode && (
              <Button
                variant="outline"
                className="text-muted-foreground rounded-xl h-auto py-4"
                style={{ border: "1px dashed hsl(var(--border))" }}
                onClick={() => setPickingExercise(true)}
              >
                <Plus size={16} strokeWidth={2} />
                Add exercise
              </Button>
            )}
          </div>
        </>
      )}

      <div className="px-5 pb-6 flex flex-col gap-2.5">
        <Button
          variant="outline"
          className="w-full text-muted-foreground gap-2"
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? (
            "Done editing"
          ) : (
            <>
              <Pencil size={14} strokeWidth={2} />
              Edit template
            </>
          )}
        </Button>
      </div>

      {editingExisting && editingExistingConfig && (
        <ExerciseConfigEditor
          exerciseName={editingExisting.name}
          initial={editingExistingConfig}
          onSave={(values) => handleSaveConfig(editingExisting.exerciseId, values)}
          onCancel={() => setEditingExisting(null)}
        />
      )}

      {addingNew && (
        <ExerciseConfigEditor
          exerciseName={addingNew.name}
          initial={DEFAULT_CONFIG}
          onSave={(values) => handleSaveConfig(addingNew.id, values)}
          onCancel={() => setAddingNew(null)}
        />
      )}

      {pickingExercise && (
        <ExercisePicker
          existingExerciseIds={template.exercises.map((e) => e.exerciseId)}
          onPick={(libraryExercise) => {
            setPickingExercise(false);
            setAddingNew(libraryExercise);
          }}
          onCancel={() => setPickingExercise(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete template"
          message={`Delete "${template.name}"? This cannot be undone.`}
          onConfirm={() => {
            setConfirmingDelete(false);
            handleDeleteTemplate();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

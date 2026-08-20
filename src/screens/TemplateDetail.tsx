import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Clock, GripVertical, Pencil, Plus, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IconButton } from "@/components/ui/icon-button";
import { TopBar } from "@/components/TopBar";
import { SortableRow, type DragHandleProps } from "@/components/SortableRow";
import { ExerciseConfigEditor, type ExerciseConfigValues } from "@/components/ExerciseConfigEditor";
import { ExercisePicker } from "@/components/ExercisePicker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { fmtTime, type Exercise } from "@/lib/data";
import { fmtRelativeDate } from "@/lib/utils";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";
import { PAGE_INPUT_STYLE } from "@/lib/inputStyles";
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
  onViewExerciseHistory: (exerciseName: string, templateName: string) => void;
}

const DEFAULT_CONFIG: ExerciseConfigValues = {
  targetSets: 4,
  repsMin: 6,
  repsMax: 8,
  targetWeight: 20,
  restSeconds: 90,
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  const handleReorderExercises = async (reordered: Exercise[]) => {
    setActionError(null);
    const updated: Template = {
      ...template,
      exercises: reordered.map((ex, i) => {
        const cfg = template.exercises.find((c) => c.exerciseId === ex.id);
        return cfg ? { ...cfg, order: i } : cfg;
      }).filter((c): c is Template["exercises"][number] => c !== undefined),
    };
    setExercises(reordered);
    try {
      await saveTemplate(updated);
    } catch {
      setActionError("Couldn't reorder exercises — try again.");
      reload();
    }
  };

  const handleDragEndExercises = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = exercises.findIndex((ex) => ex.id === over.id);
    handleReorderExercises(arrayMove(exercises, oldIndex, newIndex));
  };

  // Button-based reorder alternative alongside the drag handle — dragging
  // alone has no single-pointer/keyboard equivalent, which WCAG 2.2 SC 2.5.7
  // (Dragging Movements) requires.
  const moveExercise = (id: string, direction: -1 | 1) => {
    const idx = exercises.findIndex((ex) => ex.id === id);
    const newIndex = idx + direction;
    if (idx === -1 || newIndex < 0 || newIndex >= exercises.length) return;
    handleReorderExercises(arrayMove(exercises, idx, newIndex));
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

  const renderExerciseCard = (
    ex: Exercise,
    index: number,
    handleProps?: DragHandleProps,
    reorder?: { onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean }
  ) => (
    <Card
      key={ex.id}
      onClick={() =>
        editMode
          ? setEditingExisting({ exerciseId: ex.id, name: ex.name })
          : onViewExerciseHistory(ex.name, template.name)
      }
      style={{ cursor: "pointer" }}
    >
      <CardHeader style={{ padding: "14px 16px 10px" }}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-1">
            {handleProps ? (
              <>
                <button
                  {...handleProps}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "grab",
                    color: "hsl(var(--muted-foreground))",
                    width: 44,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginLeft: -12,
                    touchAction: "none",
                  }}
                  aria-label="Drag to reorder"
                >
                  <GripVertical size={16} strokeWidth={2} />
                </button>
                {reorder && (
                  <div className="flex flex-col" style={{ marginLeft: -8, marginRight: 2 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder.onMoveUp();
                      }}
                      disabled={!reorder.canMoveUp}
                      style={{
                        background: "none",
                        border: "none",
                        width: 28,
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "hsl(var(--muted-foreground))",
                        cursor: reorder.canMoveUp ? "pointer" : "default",
                        opacity: reorder.canMoveUp ? 1 : 0.3,
                      }}
                      aria-label={`Move ${ex.name} up`}
                    >
                      <ChevronUp size={16} strokeWidth={2} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder.onMoveDown();
                      }}
                      disabled={!reorder.canMoveDown}
                      style={{
                        background: "none",
                        border: "none",
                        width: 28,
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "hsl(var(--muted-foreground))",
                        cursor: reorder.canMoveDown ? "pointer" : "default",
                        opacity: reorder.canMoveDown ? 1 : 0.3,
                      }}
                      aria-label={`Move ${ex.name} down`}
                    >
                      <ChevronDown size={16} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground min-w-[20px]">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <div>
              <p className="font-semibold text-[15px]">{ex.name}</p>
              <div className="flex gap-1.5 items-center mt-1">
                <Badge variant="secondary" style={{ fontSize: 10, padding: "1px 7px" }}>
                  {ex.muscle}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock size={16} strokeWidth={2} />
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
              <IconButton
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteExercise(ex.id);
                }}
                aria-label="Delete exercise"
              >
                <X size={16} strokeWidth={2} />
              </IconButton>
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
          <p className="font-mono text-[11px] text-muted-foreground italic">No previous data</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div>
      <TopBar
        title={template.name}
        sub={lastPerformed ? `Last performed ${lastPerformed}` : "Never performed"}
        onBack={onBack}
        breadcrumb={[{ label: "Templates", onClick: onBack }]}
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
            className="field-input"
            style={PAGE_INPUT_STYLE}
            defaultValue={template.name}
            aria-label="Template name"
            onBlur={(e) => handleRename(e.target.value)}
          />
          <Button variant="destructive" className="w-full" onClick={() => setConfirmingDelete(true)}>
            Delete template
          </Button>
        </div>
      )}

      {exercises.length === 0 && !editMode ? (
        <div className="px-5">
          <EmptyState
            message="No exercises in this template yet."
            action={{
              label: "Add exercise",
              onClick: () => {
                setEditMode(true);
                setPickingExercise(true);
              },
            }}
          />
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
            {editMode ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndExercises}>
                <SortableContext items={exercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
                  {exercises.map((ex, i) => (
                    <SortableRow key={ex.id} id={ex.id}>
                      {(handleProps) =>
                        renderExerciseCard(ex, i, handleProps, {
                          onMoveUp: () => moveExercise(ex.id, -1),
                          onMoveDown: () => moveExercise(ex.id, 1),
                          canMoveUp: i > 0,
                          canMoveDown: i < exercises.length - 1,
                        })
                      }
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              exercises.map((ex, i) => renderExerciseCard(ex, i))
            )}

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
              <Pencil size={16} strokeWidth={2} />
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

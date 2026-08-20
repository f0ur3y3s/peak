import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import { SortableRow } from "@/components/SortableRow";
import { fmtRelativeDate } from "@/lib/utils";
import { groupForMuscle } from "@/lib/muscles";
import { PAGE_INPUT_STYLE } from "@/lib/inputStyles";
import {
  getTemplates,
  getWorkoutSessions,
  getExerciseLibrary,
  saveTemplate,
  reorderTemplates,
  type Template,
  type LibraryExercise,
} from "@/lib/db";

interface TemplatesScreenProps {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (id: string) => void;
}

export function TemplatesScreen({
  onSelectTemplate,
  onCreateTemplate,
}: TemplatesScreenProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lastPerformed, setLastPerformed] = useState<Map<string, number>>(new Map());
  const [libraryById, setLibraryById] = useState<Map<string, LibraryExercise>>(new Map());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    getTemplates().then(setTemplates);
    getWorkoutSessions().then((sessions) => {
      const map = new Map<string, number>();
      for (const s of sessions) {
        const key = s.templateId ?? `name:${s.templateName}`;
        if (!map.has(key)) map.set(key, s.startedAt);
      }
      setLastPerformed(map);
    });
    getExerciseLibrary().then((library) => {
      setLibraryById(new Map(library.map((ex) => [ex.id, ex])));
    });
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    const nextOrder = templates.reduce((max, t) => Math.max(max, t.order), -1) + 1;
    const template: Template = {
      id: crypto.randomUUID(),
      name,
      exercises: [],
      order: nextOrder,
      updatedAt: Date.now(),
    };
    try {
      await saveTemplate(template);
    } catch {
      setCreateError("Couldn't create template — try again.");
      return;
    }
    onCreateTemplate(template.id);
  };

  // distance: 8 lets a plain tap still navigate into the template — the
  // drag only "activates" once the pointer has moved far enough that it's
  // clearly a drag gesture, not a tap. PointerSensor (not the old manual
  // pointer-event wiring) is what gives this correct touch behavior on
  // mobile — it normalizes mouse/touch/pen through the Pointer Events API.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = templates.findIndex((t) => t.id === active.id);
    const newIndex = templates.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(templates, oldIndex, newIndex);
    setTemplates(reordered);
    reorderTemplates(reordered.map((t) => t.id));
  };

  // Button-based reorder alternative alongside the drag handle — dragging
  // alone has no single-pointer/keyboard equivalent, which WCAG 2.2 SC 2.5.7
  // (Dragging Movements) requires.
  const moveTemplate = (id: string, direction: -1 | 1) => {
    const idx = templates.findIndex((t) => t.id === id);
    const newIndex = idx + direction;
    if (idx === -1 || newIndex < 0 || newIndex >= templates.length) return;
    const reordered = arrayMove(templates, idx, newIndex);
    setTemplates(reordered);
    reorderTemplates(reordered.map((t) => t.id));
  };

  return (
    <div>
      <TopBar title="Templates" />

      <div className="px-5 pt-4 pb-24 flex flex-col gap-2.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={templates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {templates.map((t, i) => {
              const lastTs = lastPerformed.get(t.id) ?? lastPerformed.get(`name:${t.name}`);
              const muscleGroups = [
                ...new Set(
                  t.exercises
                    .map((cfg) => libraryById.get(cfg.exerciseId)?.muscle)
                    .filter((m): m is string => !!m)
                    .map(groupForMuscle)
                ),
              ];
              return (
                <SortableRow key={t.id} id={t.id}>
                  {(handleProps) => (
                    <Card
                      onClick={() => onSelectTemplate(t.id)}
                      className="cursor-pointer transition-colors"
                    >
                      <CardContent style={{ padding: "14px 16px" }} className="flex items-center gap-1">
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
                        <div className="flex flex-col" style={{ marginLeft: -8, marginRight: 6, flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveTemplate(t.id, -1);
                            }}
                            disabled={i === 0}
                            style={{
                              background: "none",
                              border: "none",
                              width: 28,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "hsl(var(--muted-foreground))",
                              cursor: i === 0 ? "default" : "pointer",
                              opacity: i === 0 ? 0.3 : 1,
                            }}
                            aria-label={`Move ${t.name} up`}
                          >
                            <ChevronUp size={16} strokeWidth={2} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveTemplate(t.id, 1);
                            }}
                            disabled={i === templates.length - 1}
                            style={{
                              background: "none",
                              border: "none",
                              width: 28,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "hsl(var(--muted-foreground))",
                              cursor: i === templates.length - 1 ? "default" : "pointer",
                              opacity: i === templates.length - 1 ? 0.3 : 1,
                            }}
                            aria-label={`Move ${t.name} down`}
                          >
                            <ChevronDown size={16} strokeWidth={2} />
                          </button>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-[15px]">{t.name}</p>
                              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                                {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {lastTs ? fmtRelativeDate(lastTs) : "Never"}
                            </p>
                          </div>
                          {muscleGroups.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mt-2.5">
                              {muscleGroups.map((group) => (
                                <Badge
                                  key={group}
                                  variant="secondary"
                                  style={{ fontSize: 10, padding: "1px 7px" }}
                                >
                                  {group}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </SortableRow>
              );
            })}
          </SortableContext>
        </DndContext>

        {creating ? (
          <Card>
            <CardContent style={{ padding: 14 }} className="flex flex-col gap-2.5">
              <input
                className="field-input"
                style={PAGE_INPUT_STYLE}
                placeholder="Template name"
                aria-label="Template name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              {createError && (
                <p
                  className="font-mono text-[11px]"
                  style={{ color: "hsl(var(--destructive))", margin: 0 }}
                >
                  {createError}
                </p>
              )}
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setCreateError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button className="flex-1 font-semibold" onClick={handleCreate}>
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            className="text-muted-foreground rounded-xl h-auto py-4"
            style={{ border: "1px dashed hsl(var(--border))" }}
            onClick={() => setCreating(true)}
          >
            + New Template
          </Button>
        )}
      </div>
    </div>
  );
}

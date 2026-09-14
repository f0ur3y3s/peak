import { useId, useState } from "react";
import { Check, Clock, Minus, Plus, X } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fmtTime, type Exercise } from "@/lib/data";
import { useWeightUnit, fmtWeight, toDisplayWeight, toKgWeight } from "@/lib/weightUnit";
import { NotesBlock } from "@/components/NotesBlock";

interface ExerciseCardProps {
  ex: Exercise;
  isActive: boolean;
  onActivate: (id: string) => void;
  onLogSet: (exId: string, reps: number, weight: number) => void;
  onDeleteSet: (exId: string, setId: string) => void;
  onUpdateRest: (exId: string, restSeconds: number) => void;
}

export function ExerciseCard({
  ex,
  isActive,
  onActivate,
  onLogSet,
  onDeleteSet,
  onUpdateRest,
}: ExerciseCardProps) {
  const { unit } = useWeightUnit();
  const logFormIdBase = useId();
  const repsFieldId = `${logFormIdBase}-reps`;
  const weightFieldId = `${logFormIdBase}-weight`;
  const lastIdx = ex.logged.length;
  const defaultReps = String(ex.last?.[lastIdx]?.r ?? ex.repsMin);
  const defaultWeight = String(toDisplayWeight(ex.last?.[lastIdx]?.w ?? ex.targetWeight, unit));
  const [reps, setReps] = useState(defaultReps);
  const [weight, setWeight] = useState(defaultWeight);
  const [addingExtra, setAddingExtra] = useState(false);
  const [editingRest, setEditingRest] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [deletingSet, setDeletingSet] = useState<
    { id: string; index: number; reps: number; weight: number } | null
  >(null);
  const weightStep = unit === "lb" ? 1 : 0.5;

  const repsNum = Number(reps);
  const weightNum = Number(weight);
  const canLog = Number.isFinite(repsNum) && repsNum > 0 && Number.isFinite(weightNum) && weightNum >= 0;

  const done = ex.logged.length >= ex.targetSets;
  const showLogForm = isActive && (!done || addingExtra);
  const effectiveTarget = Math.max(ex.targetSets, ex.logged.length);

  const cardBorderClass = done
    ? "card-complete"
    : isActive
    ? "card-active"
    : "";

  return (
    <>
    <Card
      className={cardBorderClass}
      onClick={() => !isActive && onActivate(ex.id)}
      style={{ cursor: isActive ? "default" : "pointer", transition: "border-color 0.2s" }}
    >
      {/* Header */}
      <CardHeader style={{ padding: "15px 16px 12px" }}>
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-start gap-3">
            <p className="font-semibold text-title" style={{ minWidth: 0 }}>{ex.name}</p>
            {/* Set pips instead of "1/4": countable at a glance, and they
                cannot squeeze a long name the way a right-aligned numeral
                pair did. */}
            <div
              className="flex gap-1 flex-shrink-0"
              style={{ paddingTop: 5 }}
              aria-label={`${ex.logged.length} of ${effectiveTarget} sets logged`}
            >
              {Array.from({ length: effectiveTarget }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 16,
                    height: 5,
                    borderRadius: 3,
                    background:
                      i < ex.logged.length
                        ? done
                          ? "hsl(var(--success))"
                          : "hsl(var(--primary))"
                        : "hsl(var(--secondary))",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-caption" style={{ whiteSpace: "nowrap" }}>
              {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
              {ex.targetWeight > 0 ? ` @ ${fmtWeight(ex.targetWeight, unit)}${unit}` : ""}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {ex.notes && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotes((v) => !v);
                  }}
                  className="text-caption"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: showNotes ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    padding: 0,
                  }}
                  aria-expanded={showNotes}
                >
                  Notes
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingRest((v) => !v);
                }}
                className="font-mono text-caption"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: editingRest ? "hsl(var(--primary) / 0.15)" : "transparent",
                  border: `1px solid ${editingRest ? "hsl(var(--primary) / 0.5)" : "hsl(var(--border))"}`,
                  borderRadius: 999,
                  color: editingRest ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  padding: "3px 9px",
                  cursor: "pointer",
                }}
              >
                <Clock size={16} strokeWidth={2} />
                {fmtTime(ex.restSeconds)}
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      {editingRest && (
        <div className="px-4 pb-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="stepper" style={{ width: "100%" }}>
            <button
              className="stepper-btn"
              aria-label="Decrease rest time"
              onClick={() => onUpdateRest(ex.id, Math.max(0, ex.restSeconds - 15))}
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            <span className="stepper-input font-mono text-sm" style={{ textAlign: "center" }}>
              {fmtTime(ex.restSeconds)}
            </span>
            <button
              className="stepper-btn"
              aria-label="Increase rest time"
              onClick={() => onUpdateRest(ex.id, ex.restSeconds + 15)}
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Collapsed by default: a form cue is worth a tap when you want it,
          but printed above every set form it pushed the inputs down the card
          on every single set. */}
      {showNotes && ex.notes && (
        <div className="px-4 pb-2.5">
          <NotesBlock notes={ex.notes} />
        </div>
      )}

      {/* Logged sets */}
      {ex.logged.length > 0 && (
        <div className="px-4">
          <Separator className="mb-2" />
          {ex.logged.map((s, i) => (
            <div
              key={s.id}
              className="grid gap-2 items-center py-1.5 border-b border-border"
              style={{ gridTemplateColumns: "20px 1fr 44px" }}
            >
              <span className="font-mono text-caption text-muted-foreground">{i + 1}</span>
              <span className="font-mono text-sm">
                {s.reps} × {fmtWeight(s.weight, unit)}{" "}
                <span className="text-caption text-muted-foreground">{unit}</span>
              </span>
              {/* Muted, not a filled red tile: deleting a set is rare and
                  reversible by re-logging it, and the loudest element on a
                  logged row should be the set, not the way to destroy it. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingSet({ id: s.id, index: i, reps: s.reps, weight: s.weight });
                }}
                style={{
                  justifySelf: "end",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: -12,
                }}
                aria-label={`Delete set ${i + 1}`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Log set form */}
      {showLogForm && (
        <CardContent
          className="log-form mx-4 mb-3.5 mt-2.5 rounded-[10px] border border-border"
          style={{ padding: 14, background: "hsl(var(--background))" }}
        >
          {/* What you did last time sits with the field you are about to
              type into, rather than as a separate row of chips higher up the
              card that you have to look back at. */}
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="font-mono text-label text-muted-foreground uppercase tracking-widest">
              Set {ex.logged.length + 1}{done ? " (extra)" : ""}
            </p>
            {ex.last && ex.last[lastIdx] && (
              <p className="font-mono text-caption text-muted-foreground" style={{ whiteSpace: "nowrap" }}>
                last time {ex.last[lastIdx].r}×{fmtWeight(ex.last[lastIdx].w, unit)}{unit}
              </p>
            )}
          </div>
          <div className="stepper-pair grid grid-cols-2 gap-2.5 mb-3">
            {(
              [
                ["Reps", reps, setReps, 1, repsFieldId],
                [`Weight (${unit})`, weight, setWeight, weightStep, weightFieldId],
              ] as [string, string, (v: string | ((prev: string) => string)) => void, number, string][]
            ).map(([label, val, setter, step, fieldId]) => (
              <div key={label}>
                <label htmlFor={fieldId} className="block text-caption text-muted-foreground mb-1.5">{label}</label>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    aria-label={`Decrease ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // An empty/invalid field parses to NaN, which would
                      // otherwise get stuck (NaN - step is still NaN) with
                      // no way to recover except retyping the whole value.
                      setter((v) => {
                        const n = parseFloat(v);
                        return String(Math.max(0, (Number.isFinite(n) ? n : 0) - step));
                      });
                    }}
                  >
                    <Minus size={16} strokeWidth={2} />
                  </button>
                  <input
                    id={fieldId}
                    className="stepper-input"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="stepper-btn"
                    aria-label={`Increase ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setter((v) => {
                        const n = parseFloat(v);
                        return String((Number.isFinite(n) ? n : 0) + step);
                      });
                    }}
                  >
                    <Plus size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="w-full font-semibold text-title tracking-tight"
            disabled={!canLog}
            onClick={(e) => {
              e.stopPropagation();
              if (!canLog) return;
              onLogSet(ex.id, repsNum, toKgWeight(weightNum, unit));
              setAddingExtra(false);
            }}
          >
            Log Set {ex.logged.length + 1}
          </Button>
        </CardContent>
      )}

      {done && !addingExtra && (
        <div className="px-4 pb-3.5 pt-1.5 flex items-center justify-between gap-2">
          <p className="font-mono text-xs inline-flex items-center gap-1" style={{ color: "hsl(var(--success))" }}>
            <Check size={16} strokeWidth={2} />
            All sets complete
          </p>
          {isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const last = ex.logged[ex.logged.length - 1];
                setReps(String(last?.reps ?? ex.repsMin));
                setWeight(String(toDisplayWeight(last?.weight ?? ex.targetWeight, unit)));
                setAddingExtra(true);
              }}
              className="font-mono text-xs inline-flex items-center gap-1"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--muted-foreground))",
                textDecoration: "underline",
              }}
            >
              <Plus size={16} strokeWidth={2} />
              Add set
            </button>
          )}
        </div>
      )}
    </Card>

    {deletingSet && (
      <ConfirmDialog
        title="Delete set"
        message={`Delete set ${deletingSet.index + 1} (${deletingSet.reps} reps × ${fmtWeight(deletingSet.weight, unit)}${unit})?`}
        onConfirm={() => {
          onDeleteSet(ex.id, deletingSet.id);
          setDeletingSet(null);
        }}
        onCancel={() => setDeletingSet(null)}
      />
    )}
    </>
  );
}

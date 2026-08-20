import { useId, useState } from "react";
import { Check, Clock, Minus, Plus, X } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fmtTime, type Exercise } from "@/lib/data";
import { useWeightUnit, fmtWeight, toDisplayWeight, toKgWeight } from "@/lib/weightUnit";

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
      <CardHeader style={{ padding: "14px 16px 8px" }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-[15px] mb-1">{ex.name}</p>
            <div className="flex gap-1.5 items-center">
              <Badge
                variant="secondary"
                style={{
                  fontSize: 10,
                  padding: "1px 7px",
                }}
              >
                {ex.muscle}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">
                {ex.targetSets}×{ex.repsMin}–{ex.repsMax} @ {fmtWeight(ex.targetWeight, unit)}{unit}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingRest((v) => !v);
                }}
                className="font-mono text-[11px]"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: editingRest ? "hsl(var(--primary) / 0.15)" : "hsl(var(--secondary))",
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
          <div className="text-right">
            <p
              className="font-mono text-[22px] font-medium"
              style={{
                color: done
                  ? "hsl(var(--success))"
                  : isActive
                  ? "hsl(var(--primary))"
                  : "hsl(var(--muted-foreground))",
              }}
            >
              {ex.logged.length}
              <span className="text-sm text-muted-foreground">/{effectiveTarget}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">sets</p>
          </div>
        </div>
      </CardHeader>

      {editingRest && (
        <div className="px-4 pb-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="stepper" style={{ width: "100%" }}>
            <button
              className="stepper-btn"
              onClick={() => onUpdateRest(ex.id, Math.max(0, ex.restSeconds - 15))}
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            <span className="stepper-input font-mono text-sm" style={{ textAlign: "center" }}>
              {fmtTime(ex.restSeconds)}
            </span>
            <button
              className="stepper-btn"
              onClick={() => onUpdateRest(ex.id, ex.restSeconds + 15)}
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Previous session chips */}
      {ex.last && (
        <div className="flex gap-1.5 items-center flex-wrap px-4 pb-2.5">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            prev
          </span>
          {ex.last.map((s, i) => (
            <span key={i} className="set-chip">
              {s.r}×{fmtWeight(s.w, unit)}
            </span>
          ))}
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
              style={{ gridTemplateColumns: "20px 1fr 1fr 44px" }}
            >
              <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="font-mono text-sm">{s.reps} reps</span>
              <span className="font-mono text-sm">{fmtWeight(s.weight, unit)} {unit}</span>
              <IconButton
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingSet({ id: s.id, index: i, reps: s.reps, weight: s.weight });
                }}
                style={{ justifySelf: "end" }}
                aria-label="Delete set"
              >
                <X size={16} strokeWidth={2} />
              </IconButton>
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
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-3">
            Set {ex.logged.length + 1}{done ? " (extra)" : ""}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {(
              [
                ["Reps", reps, setReps, 1, repsFieldId],
                [`Weight (${unit})`, weight, setWeight, weightStep, weightFieldId],
              ] as [string, string, (v: string | ((prev: string) => string)) => void, number, string][]
            ).map(([label, val, setter, step, fieldId]) => (
              <div key={label}>
                <label htmlFor={fieldId} className="block text-[11px] text-muted-foreground mb-1.5">{label}</label>
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
            className="w-full font-semibold text-[15px] tracking-tight"
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

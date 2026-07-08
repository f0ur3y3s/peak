import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { type Exercise } from "@/lib/data";

interface ExerciseCardProps {
  ex: Exercise;
  isActive: boolean;
  onActivate: (id: string) => void;
  onLogSet: (exId: string, reps: number, weight: number) => void;
}

export function ExerciseCard({ ex, isActive, onActivate, onLogSet }: ExerciseCardProps) {
  const lastIdx = ex.logged.length;
  const defaultReps = String(ex.last?.[lastIdx]?.r ?? ex.repsMin);
  const defaultWeight = String(ex.last?.[lastIdx]?.w ?? ex.targetWeight);
  const [reps, setReps] = useState(defaultReps);
  const [weight, setWeight] = useState(defaultWeight);

  const done = ex.logged.length >= ex.targetSets;

  const cardBorderClass = done
    ? "card-complete"
    : isActive
    ? "card-active"
    : "";

  return (
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
                  color: "#a78bfa",
                  background: "hsl(262 80% 58% / 0.15)",
                }}
              >
                {ex.muscle}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">
                {ex.targetSets}×{ex.repsMin}–{ex.repsMax} @ {ex.targetWeight}kg
              </span>
            </div>
          </div>
          <div className="text-right">
            <p
              className="font-mono text-[22px] font-medium"
              style={{
                color: done
                  ? "hsl(142 70% 45%)"
                  : isActive
                  ? "hsl(var(--primary))"
                  : "hsl(var(--muted-foreground))",
              }}
            >
              {ex.logged.length}
              <span className="text-sm text-muted-foreground">/{ex.targetSets}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">sets</p>
          </div>
        </div>
      </CardHeader>

      {/* Previous session chips */}
      {ex.last && (
        <div className="flex gap-1.5 items-center flex-wrap px-4 pb-2.5">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            prev
          </span>
          {ex.last.map((s, i) => (
            <span key={i} className="set-chip">
              {s.r}×{s.w}
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
              style={{ gridTemplateColumns: "20px 1fr 1fr 28px" }}
            >
              <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="font-mono text-sm">{s.reps} reps</span>
              <span className="font-mono text-sm">{s.weight} kg</span>
              <span
                className="font-mono text-xs text-center rounded"
                style={{
                  color: "hsl(var(--primary))",
                  background: "hsl(var(--primary) / 0.15)",
                  padding: "2px 4px",
                }}
              >
                ✓
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Log set form */}
      {isActive && !done && (
        <CardContent
          className="log-form mx-4 mb-3.5 mt-2.5 rounded-[10px] border border-border"
          style={{ padding: 14, background: "hsl(var(--background))" }}
        >
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-3">
            Set {ex.logged.length + 1}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {(
              [
                ["Reps", reps, setReps, 1],
                ["Weight (kg)", weight, setWeight, 0.5],
              ] as [string, string, (v: string | ((prev: string) => string)) => void, number][]
            ).map(([label, val, setter, step]) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setter((v) => String(Math.max(0, parseFloat(v) - step)));
                    }}
                  >
                    −
                  </button>
                  <input
                    className="stepper-input"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="stepper-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setter((v) => String(parseFloat(v) + step));
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="w-full font-semibold text-[15px] tracking-tight"
            onClick={(e) => {
              e.stopPropagation();
              onLogSet(ex.id, Number(reps), Number(weight));
            }}
          >
            Log Set {ex.logged.length + 1}
          </Button>
        </CardContent>
      )}

      {done && (
        <div className="px-4 pb-3.5 pt-1.5">
          <p className="font-mono text-xs" style={{ color: "hsl(142 70% 45%)" }}>
            ✓ All sets complete
          </p>
        </div>
      )}
    </Card>
  );
}

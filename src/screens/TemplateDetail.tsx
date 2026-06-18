import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TopBar } from "@/components/TopBar";
import { SEED_EXERCISES, fmtTime } from "@/lib/data";

interface TemplateDetailProps {
  onStart: () => void;
  onBack: () => void;
  onSignOut: () => void;
}

export function TemplateDetail({ onStart, onBack, onSignOut }: TemplateDetailProps) {
  return (
    <div>
      <TopBar
        title="Push Day A"
        sub="Last performed 3 days ago"
        onBack={onBack}
        right={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={onSignOut}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--muted-foreground))",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.05em",
                padding: "4px 8px",
              }}
            >
              sign out
            </button>
            <Button onClick={onStart} className="font-semibold tracking-tight">
              Start
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      <div className="px-5 pt-4">
        <Card>
          <CardContent style={{ padding: "16px 20px" }} className="flex gap-7">
            {(
              [
                ["3", "exercises"],
                ["10", "total sets"],
                ["~55", "min avg"],
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

      {/* Exercise list */}
      <div className="px-5 pt-3.5 pb-24 flex flex-col gap-2.5">
        {SEED_EXERCISES.map((ex, i) => (
          <Card key={ex.id}>
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
                        ⏱ {fmtTime(ex.restSeconds)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">
                    {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    @ {ex.targetWeight} kg
                  </p>
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
                        {s.r}×{s.w}kg
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
      </div>
    </div>
  );
}

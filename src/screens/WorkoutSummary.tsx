import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { sessionVolume, sessionSetCount, type WorkoutSession } from "@/lib/db";
import { fmtTime } from "@/lib/data";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";

interface WorkoutSummaryProps {
  session: WorkoutSession;
  onDone: () => void;
}

export function WorkoutSummary({ session, onDone }: WorkoutSummaryProps) {
  const { unit } = useWeightUnit();
  const durationSeconds = Math.round((session.finishedAt - session.startedAt) / 1000);
  const totalVolume = sessionVolume(session);
  const totalSets = sessionSetCount(session);

  return (
    <div className="px-5 pt-10 pb-10 flex flex-col gap-6">
      <div className="text-center">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest mb-2">
          Workout Complete 🎉
        </p>
        <p className="font-semibold text-2xl">{session.templateName}</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {fmtTime(durationSeconds)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {Number(fmtWeight(totalVolume, unit)).toLocaleString()}{unit}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Volume</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {totalSets}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Sets</p>
          </CardContent>
        </Card>
      </div>

      {session.prs.length > 0 && (
        <div>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest mb-2.5">
            Personal Records
          </p>
          <div className="flex flex-col gap-2">
            {session.prs.map((name) => (
              <Card key={name}>
                <CardContent
                  style={{ padding: "10px 14px" }}
                  className="flex justify-between items-center"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <Badge
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      background: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                      letterSpacing: "0.08em",
                    }}
                  >
                    PR
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full font-semibold text-[15px] tracking-tight" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

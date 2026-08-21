import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PartyPopper } from "lucide-react";
import { sessionVolume, sessionSetCount, type WorkoutSession } from "@/lib/db";
import { fmtTime } from "@/lib/data";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";

interface WorkoutSummaryProps {
  session: WorkoutSession;
  /** Template changes Finish made silently (raised set targets, newly-added
   * exercises) — Finish has no confirmation step, so these are surfaced
   * here instead of disappearing with no trace. */
  templateUpdates?: string[];
  onDone: () => void;
}

export function WorkoutSummary({ session, templateUpdates, onDone }: WorkoutSummaryProps) {
  const { unit } = useWeightUnit();
  const durationSeconds = Math.round((session.finishedAt - session.startedAt) / 1000);
  const totalVolume = sessionVolume(session);
  const totalSets = sessionSetCount(session);

  return (
    <div className="px-5 pt-10 pb-10 flex flex-col gap-6">
      <div className="text-center">
        <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-center gap-1.5">
          Workout Complete
          <PartyPopper size={16} strokeWidth={2} />
        </p>
        <h1 className="font-title text-2xl uppercase tracking-wide m-0">{session.templateName}</h1>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {fmtTime(durationSeconds)}
            </p>
            <p className="text-caption text-muted-foreground mt-px">Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {Number(fmtWeight(totalVolume, unit)).toLocaleString()}{unit}
            </p>
            <p className="text-caption text-muted-foreground mt-px">Volume</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: "14px 10px", textAlign: "center" }}>
            <p className="font-mono text-lg" style={{ color: "hsl(var(--primary))" }}>
              {totalSets}
            </p>
            <p className="text-caption text-muted-foreground mt-px">Sets</p>
          </CardContent>
        </Card>
      </div>

      {session.prs.length > 0 && (
        <div>
          <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2.5">
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
                    className="text-label"
                    style={{
                      padding: "1px 6px",
                      background: "hsl(var(--success) / 0.18)",
                      color: "hsl(var(--success))",
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

      {templateUpdates && templateUpdates.length > 0 && (
        <div>
          <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2.5">
            Template Updated
          </p>
          <Card>
            <CardContent style={{ padding: "12px 14px" }} className="flex flex-col gap-1.5">
              {templateUpdates.map((line, i) => (
                <p key={i} className="text-subtext text-muted-foreground">
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Button className="w-full font-semibold text-title tracking-tight" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

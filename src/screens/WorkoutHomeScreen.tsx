import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { fmtRelativeDate } from "@/lib/utils";
import { useWeightUnit, fmtWeight } from "@/lib/weightUnit";
import {
  getWorkoutSessions,
  getLastUsedTemplateId,
  getTemplate,
  sessionVolume,
  sessionSetCount,
  type WorkoutSession,
} from "@/lib/db";

interface WorkoutHomeScreenProps {
  onBrowseTemplates: () => void;
  onSelectTemplate: (id: string) => void;
}

const WEEK_MS = 7 * 86_400_000;

// The tab bar's landing screen for a returning user with no workout in
// progress — previously a single sentence and a button with no data on it,
// even though everything below (last session, quick-start template) was
// already one function call away in lib/db.ts.
export function WorkoutHomeScreen({ onBrowseTemplates, onSelectTemplate }: WorkoutHomeScreenProps) {
  const { unit } = useWeightUnit();
  const [loaded, setLoaded] = useState(false);
  const [lastSession, setLastSession] = useState<WorkoutSession | null>(null);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [quickStart, setQuickStart] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getWorkoutSessions(), getLastUsedTemplateId()]).then(([sessions, templateId]) => {
      if (cancelled) return;
      setLastSession(sessions[0] ?? null);
      const weekAgo = Date.now() - WEEK_MS;
      setSessionsThisWeek(sessions.filter((s) => s.startedAt >= weekAgo).length);
      if (templateId) {
        getTemplate(templateId).then((t) => {
          if (!cancelled && t) setQuickStart({ id: t.id, name: t.name });
        });
      }
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return <TopBar title="Workout" />;

  if (!lastSession) {
    return (
      <div>
        <TopBar title="Workout" />
        <div className="px-5">
          <EmptyState
            message="Start a template to log your first workout."
            action={{ label: "Browse Templates", onClick: onBrowseTemplates }}
          />
        </div>
      </div>
    );
  }

  const durationMin = Math.round((lastSession.finishedAt - lastSession.startedAt) / 60000);
  const volume = sessionVolume(lastSession);
  const setCount = sessionSetCount(lastSession);

  return (
    <div>
      <TopBar title="Workout" />
      <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
        {quickStart && (
          <Card
            onClick={() => onSelectTemplate(quickStart.id)}
            className="cursor-pointer transition-colors"
          >
            <CardContent
              style={{ padding: "16px 18px" }}
              className="flex items-center justify-between gap-3"
            >
              <div style={{ minWidth: 0 }}>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                  Quick start
                </p>
                <p className="font-semibold text-[16px] truncate">{quickStart.name}</p>
              </div>
              <Button
                className="font-semibold flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTemplate(quickStart.id);
                }}
              >
                Start
              </Button>
            </CardContent>
          </Card>
        )}

        <div>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
            Last workout
          </p>
          <Card>
            <CardContent style={{ padding: "16px 18px" }}>
              <div className="flex gap-2 items-center mb-1">
                <p className="font-semibold text-[15px]">{lastSession.templateName}</p>
                {lastSession.prs.length > 0 && (
                  <Badge
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      background: "hsl(var(--success) / 0.18)",
                      color: "hsl(var(--success))",
                      letterSpacing: "0.08em",
                    }}
                  >
                    PR
                  </Badge>
                )}
              </div>
              <p className="font-mono text-[11px] text-muted-foreground mb-3.5">
                {fmtRelativeDate(lastSession.startedAt)} · {durationMin}m
              </p>
              <div className="flex gap-7">
                <div>
                  <p className="font-mono text-lg font-medium">
                    {Number(fmtWeight(volume, unit)).toLocaleString()} {unit}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-px">Volume</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-medium">{setCount}</p>
                  <p className="text-[11px] text-muted-foreground mt-px">Sets</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-medium">{sessionsThisWeek}</p>
                  <p className="text-[11px] text-muted-foreground mt-px">This week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Button variant="outline" className="w-full" onClick={onBrowseTemplates}>
          Browse all templates
        </Button>
      </div>
    </div>
  );
}

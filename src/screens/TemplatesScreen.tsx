import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import { fmtRelativeDate } from "@/lib/utils";
import { getTemplates, getWorkoutSessions, saveTemplate, type Template } from "@/lib/db";

interface TemplatesScreenProps {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (id: string) => void;
}

const NEW_TEMPLATE_INPUT_STYLE: React.CSSProperties = {
  background: "hsl(var(--background))",
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

export function TemplatesScreen({ onSelectTemplate, onCreateTemplate }: TemplatesScreenProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lastPerformed, setLastPerformed] = useState<Map<string, number>>(new Map());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates);
    getWorkoutSessions().then((sessions) => {
      const map = new Map<string, number>();
      for (const s of sessions) {
        if (!map.has(s.templateName)) map.set(s.templateName, s.startedAt);
      }
      setLastPerformed(map);
    });
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const template: Template = { id: crypto.randomUUID(), name, exercises: [] };
    await saveTemplate(template);
    onCreateTemplate(template.id);
  };

  return (
    <div>
      <TopBar title="Templates" />

      <div className="px-5 pt-4 pb-24 flex flex-col gap-2.5">
        {templates.map((t) => {
          const lastTs = lastPerformed.get(t.name);
          return (
            <Card
              key={t.id}
              onClick={() => onSelectTemplate(t.id)}
              className="cursor-pointer transition-colors"
            >
              <CardContent
                style={{ padding: "14px 16px" }}
                className="flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-[15px]">{t.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {lastTs ? fmtRelativeDate(lastTs) : "Never"}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {creating ? (
          <Card>
            <CardContent style={{ padding: 14 }} className="flex flex-col gap-2.5">
              <input
                style={NEW_TEMPLATE_INPUT_STYLE}
                placeholder="Template name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
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

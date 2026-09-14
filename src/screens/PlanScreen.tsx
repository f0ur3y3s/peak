import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { TemplatesScreen } from "@/screens/TemplatesScreen";
import { ExercisesScreen } from "@/screens/ExercisesScreen";

interface PlanScreenProps {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (id: string) => void;
  onStartTemplate: (id: string) => void;
}

type PlanTab = "sessions" | "exercises";

/**
 * The between-sessions half of the app: the sessions you run, and the library
 * of exercises they are built from. Both used to be top-level tabs, which gave
 * library maintenance the same standing as training itself.
 */
export function PlanScreen({ onSelectTemplate, onCreateTemplate, onStartTemplate }: PlanScreenProps) {
  const [tab, setTab] = useState<PlanTab>("sessions");
  // Reorder controls are hidden until you ask for them: reordering is a
  // once-in-a-while act, and leaving a grip and two chevrons on every row made
  // the list read as an editor rather than as somewhere to start a session.
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <TopBar
        title="Plan"
        right={
          tab === "sessions" ? (
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-body"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: editing ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                padding: "10px 12px",
                minHeight: 44,
              }}
            >
              {editing ? "Done" : "Edit"}
            </button>
          ) : undefined
        }
      />

      <div className="px-5 pt-3.5">
        <div
          className="flex"
          style={{
            background: "hsl(var(--surface-sunken))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            padding: 3,
          }}
          role="tablist"
          aria-label="Plan sections"
        >
          {(
            [
              ["sessions", "Sessions"],
              ["exercises", "Exercises"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                if (id === "exercises") setEditing(false);
              }}
              className="flex-1 text-subtext"
              style={{
                background: tab === id ? "hsl(var(--primary))" : "transparent",
                color: tab === id ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                fontWeight: tab === id ? 600 : 500,
                border: "none",
                borderRadius: 7,
                padding: "13px 0",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "sessions" ? (
        <TemplatesScreen
          embedded
          editing={editing}
          onSelectTemplate={onSelectTemplate}
          onCreateTemplate={onCreateTemplate}
          onStartTemplate={onStartTemplate}
        />
      ) : (
        <ExercisesScreen embedded />
      )}
    </div>
  );
}

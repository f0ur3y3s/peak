import { Dumbbell, ClipboardList, LineChart, User, BookOpen, type LucideIcon } from "lucide-react";

type Screen = "workout" | "templates" | "history" | "profile" | "exercises";

interface NavBarProps {
  active: Screen;
  onNav: (tab: Screen) => void;
  /** Shows a small indicator dot on the Workout tab — otherwise nothing
   * signals a session is still running once you navigate away from it. */
  hasActiveDraft?: boolean;
}

const TABS: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: "templates", label: "Templates", icon: ClipboardList },
  { id: "exercises", label: "Exercises", icon: BookOpen },
  { id: "workout",   label: "Workout",   icon: Dumbbell },
  { id: "history",   label: "History",   icon: LineChart },
  { id: "profile",   label: "Profile",   icon: User },
];

export function NavBar({ active, onNav, hasActiveDraft }: NavBarProps) {
  return (
    <div className="nav-bar">
      {TABS.map((t) => {
        const isWorkout = t.id === "workout";
        const showDraftDot = isWorkout && hasActiveDraft;
        return (
          <button
            key={t.id}
            className="nav-tab"
            onClick={() => onNav(t.id)}
            aria-label={showDraftDot ? `${t.label} (workout in progress)` : undefined}
          >
            {isWorkout ? (
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "hsl(var(--primary))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <t.icon size={20} strokeWidth={2} color="hsl(var(--primary-foreground))" />
                </div>
                {showDraftDot && (
                  <div
                    style={{
                      position: "absolute",
                      top: -1,
                      right: -1,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "hsl(var(--success))",
                      border: "2px solid hsl(var(--card))",
                    }}
                  />
                )}
              </div>
            ) : (
              <t.icon
                size={20}
                strokeWidth={2}
                color={active === t.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              />
            )}
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{
                color:
                  active === t.id
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground))",
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type { Screen };

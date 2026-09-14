import { Dumbbell, ClipboardList, LineChart, User, type LucideIcon } from "lucide-react";

type Screen = "workout" | "plan" | "history" | "profile";

interface NavBarProps {
  active: Screen;
  onNav: (tab: Screen) => void;
  /** Shows a small indicator dot on the Train tab — otherwise nothing
   * signals a session is still running once you navigate away from it. */
  hasActiveDraft?: boolean;
}

// Four tabs, not five. Templates and the exercise library are both things you
// maintain between sessions, so they live together under Plan; the tab bar is
// about what you are doing (training, planning, reviewing), not about which
// object type each screen happens to list.
const TABS: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: "workout", label: "Train", icon: Dumbbell },
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "history", label: "History", icon: LineChart },
  { id: "profile", label: "You", icon: User },
];

export function NavBar({ active, onNav, hasActiveDraft }: NavBarProps) {
  return (
    <div className="nav-bar">
      {TABS.map((t) => {
        const isActive = active === t.id;
        const showDraftDot = t.id === "workout" && hasActiveDraft;
        const color = isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
        return (
          <button
            key={t.id}
            className="nav-tab"
            onClick={() => onNav(t.id)}
            aria-label={showDraftDot ? `${t.label} (workout in progress)` : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <div style={{ position: "relative" }}>
              <t.icon size={22} strokeWidth={2} color={color} />
              {showDraftDot && (
                <div
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -3,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "hsl(var(--success))",
                    border: "2px solid hsl(var(--background))",
                  }}
                />
              )}
            </div>
            <span
              className="font-mono text-label uppercase tracking-wider"
              style={{ color }}
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

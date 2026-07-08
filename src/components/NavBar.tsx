import { Dumbbell, ClipboardList, LineChart, User, type LucideIcon } from "lucide-react";

type Screen = "workout" | "templates" | "history" | "profile";

interface NavBarProps {
  active: Screen;
  onNav: (tab: Screen) => void;
}

const TABS: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: "workout",   label: "Workout",   icon: Dumbbell },
  { id: "templates", label: "Templates", icon: ClipboardList },
  { id: "history",   label: "History",   icon: LineChart },
  { id: "profile",   label: "Profile",   icon: User },
];

export function NavBar({ active, onNav }: NavBarProps) {
  return (
    <div className="nav-bar">
      {TABS.map((t) => (
        <button key={t.id} className="nav-tab" onClick={() => onNav(t.id)}>
          <t.icon
            size={19}
            strokeWidth={2}
            color={active === t.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
          />
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
      ))}
    </div>
  );
}

export type { Screen };

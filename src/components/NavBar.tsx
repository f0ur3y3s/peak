type Screen = "workout" | "templates" | "history";

interface NavBarProps {
  active: Screen;
  onNav: (tab: Screen) => void;
}

const TABS: { id: Screen; label: string; icon: string }[] = [
  { id: "workout",   label: "Workout",   icon: "⚡" },
  { id: "templates", label: "Templates", icon: "📋" },
  { id: "history",   label: "History",   icon: "📈" },
];

export function NavBar({ active, onNav }: NavBarProps) {
  return (
    <div className="nav-bar">
      {TABS.map((t) => (
        <button key={t.id} className="nav-tab" onClick={() => onNav(t.id)}>
          <span
            style={{
              fontSize: 19,
              filter: active === t.id ? "none" : "grayscale(1) opacity(0.35)",
            }}
          >
            {t.icon}
          </span>
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

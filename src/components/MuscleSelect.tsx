import { useState, useRef, useEffect } from "react";
import { MUSCLE_GROUPS, fuzzyMatch } from "@/lib/muscles";

const TEXT_INPUT_STYLE: React.CSSProperties = {
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

interface MuscleSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MuscleSelect({ value, onChange, placeholder }: MuscleSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredGroups = MUSCLE_GROUPS.map((g) => ({
    group: g.group,
    muscles: g.muscles.filter((m) => fuzzyMatch(query, m) || fuzzyMatch(query, g.group)),
  })).filter((g) => g.muscles.length > 0);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        style={TEXT_INPUT_STYLE}
        placeholder={placeholder ?? "Search muscle group"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filteredGroups.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {filteredGroups.map((g) => (
            <div key={g.group}>
              <p
                className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider"
                style={{ padding: "6px 12px 2px", margin: 0 }}
              >
                {g.group}
              </p>
              {g.muscles.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setQuery(m);
                    onChange(m);
                    setOpen(false);
                  }}
                  className="text-[14px]"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 12px",
                    color: "hsl(var(--foreground))",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

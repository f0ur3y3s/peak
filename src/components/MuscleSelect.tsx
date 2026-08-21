import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { MUSCLE_GROUPS, fuzzyMatch } from "@/lib/muscles";
import { TEXT_INPUT_STYLE } from "@/lib/inputStyles";

const DROPDOWN_MARGIN = 8;
const DROPDOWN_MAX_HEIGHT = 320;

interface MuscleSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Pass when a caller renders its own visible <label htmlFor={id}> for this
   * field — otherwise it falls back to an aria-label so it's never
   * unlabeled. */
  id?: string;
}

export function MuscleSelect({ value, onChange, placeholder, id }: MuscleSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  // Positioned in fixed coordinates (recomputed from the input's own rect)
  // rather than absolute-inside-the-input, because MuscleSelect is always
  // used inside .config-editor-panel, which is overflow-y:auto — an
  // absolutely positioned dropdown taller than the panel's own intrinsic
  // height gets counted in the panel's scrollHeight, so opening it scrolls
  // the whole modal (title, name field, everything) instead of just the
  // listbox. Fixed positioning escapes that containing block entirely.
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;
      setDropdownStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, spaceBelow)),
      });
    };

    updatePosition();
    // Capture phase so scrolling any nested container (e.g. the modal
    // panel itself) repositions the dropdown too, not just window scroll.
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const filteredGroups = MUSCLE_GROUPS.map((g) => ({
    group: g.group,
    muscles: g.muscles.filter((m) => fuzzyMatch(query, m) || fuzzyMatch(query, g.group)),
  })).filter((g) => g.muscles.length > 0);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        id={id}
        className="field-input"
        style={TEXT_INPUT_STYLE}
        placeholder={placeholder ?? "Search muscle group"}
        aria-label={id ? undefined : placeholder ?? "Search muscle group"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filteredGroups.length > 0 && dropdownStyle && (
        <div
          style={{
            position: "fixed",
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            maxHeight: dropdownStyle.maxHeight,
            overflowY: "auto",
            zIndex: 70,
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

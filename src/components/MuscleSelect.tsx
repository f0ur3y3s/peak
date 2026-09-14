import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
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
  // Index into the flattened option list. -1 means "nothing highlighted", so
  // Enter falls through to whatever the field is inside rather than picking an
  // option the user never moved to.
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;
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

  // The options as the arrow keys see them: one sequence, ignoring the group
  // headings they are visually divided by. Each group also records where it
  // starts in that sequence, so an option's index never has to be recovered
  // by searching for its name — two groups are free to list the same muscle.
  const flatOptions = filteredGroups.flatMap((g) => g.muscles);
  const groupOffsets: number[] = [];
  filteredGroups.reduce((offset, g) => {
    groupOffsets.push(offset);
    return offset + g.muscles.length;
  }, 0);
  const isOpen = open && flatOptions.length > 0 && dropdownStyle !== null;

  const select = (muscle: string) => {
    setQuery(muscle);
    onChange(muscle);
    setOpen(false);
    setActiveIndex(-1);
  };

  // Keeps the highlighted option in view when the arrows walk past the
  // bottom of a list that is taller than the dropdown.
  useEffect(() => {
    if (activeIndex < 0) return;
    // getElementById rather than a CSS selector: useId produces ids
    // containing ":", which is not valid in a selector without escaping.
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (flatOptions.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        // From "nothing highlighted", Down enters at the top and Up enters at
        // the bottom. Treating -1 as an ordinary index instead put the first
        // Up press on the second-to-last option.
        if (i < 0) return step === 1 ? 0 : flatOptions.length - 1;
        return (i + step + flatOptions.length) % flatOptions.length;
      });
      return;
    }
    if (e.key === "Enter" && isOpen && activeIndex >= 0) {
      e.preventDefault();
      select(flatOptions[activeIndex]);
      return;
    }
    if (e.key === "Escape" && open) {
      // Stopped here rather than allowed to bubble: this field lives inside a
      // Modal whose document-level handler closes the whole dialog on Escape,
      // so dismissing the suggestions would have thrown away the form.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

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
        // The ARIA 1.2 combobox pattern. Without it this announced as a plain
        // text field: nothing said a list of suggestions had appeared, how
        // many there were, or which one was highlighted — and the only way
        // through the options was to Tab out of the field into them.
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
      />
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Muscle groups"
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
          {filteredGroups.map((g, gi) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p
                className="font-mono text-label text-muted-foreground uppercase tracking-wider"
                style={{ padding: "6px 12px 2px", margin: 0 }}
                aria-hidden="true"
              >
                {g.group}
              </p>
              {g.muscles.map((m, mi) => {
                const i = groupOffsets[gi] + mi;
                const active = i === activeIndex;
                return (
                  <div
                    key={m}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active}
                    // Focus stays in the input and the highlight travels via
                    // aria-activedescendant, so these must not be tab stops.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(m)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="text-body"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "8px 12px",
                      color: "hsl(var(--foreground))",
                      background: active ? "hsl(var(--secondary))" : "none",
                    }}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

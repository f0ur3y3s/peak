interface NotesBlockProps {
  notes: string;
  /** Small uppercase caption above the text, matching the "Last session" pattern. */
  label?: string;
  /** Truncate to this many lines — for list rows where full notes would crowd the page. */
  clamp?: number;
}

/**
 * Read-only display for a template's or exercise's notes. Notes are prose
 * (form cues, progression rules), so unlike the numeric readouts around them
 * they use the body font rather than the mono one, and preserve the line
 * breaks the user typed.
 */
export function NotesBlock({ notes, label, clamp }: NotesBlockProps) {
  const trimmed = notes.trim();
  if (!trimmed) return null;

  return (
    <div>
      {label && (
        <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-1.5">
          {label}
        </p>
      )}
      <p
        className="text-caption text-muted-foreground"
        style={{
          margin: 0,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          ...(clamp
            ? {
                display: "-webkit-box",
                WebkitLineClamp: clamp,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : null),
        }}
      >
        {trimmed}
      </p>
    </div>
  );
}

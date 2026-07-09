import type { CSSProperties } from "react";

// For inputs inside a modal panel (background: var(--card)) — filled with
// --background so they read as a recessed field against the panel.
export const TEXT_INPUT_STYLE: CSSProperties = {
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

// For inputs sitting directly on the page (background: var(--background))
// — filled with --card so they read as a raised field, matching the
// convention used for AuthScreen's inputs.
export const PAGE_INPUT_STYLE: CSSProperties = {
  ...TEXT_INPUT_STYLE,
  background: "hsl(var(--card))",
};

export function normalizeMuscle(value: string): string {
  return value.trim() || "Other";
}

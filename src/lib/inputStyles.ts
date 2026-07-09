import type { CSSProperties } from "react";

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

export function normalizeMuscle(value: string): string {
  return value.trim() || "Other";
}

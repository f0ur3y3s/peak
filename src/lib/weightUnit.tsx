import { createContext, useContext, useState, type ReactNode } from "react";

export type WeightUnit = "kg" | "lb";

const STORAGE_KEY = "peak-weight-unit";
const KG_PER_LB = 0.45359237;

// localStorage throws outright — not returns null — in Safari with site data
// blocked, and this runs during the provider's first render, which wrapped
// the entire app. A stored preference is never worth a white screen.
function readStoredUnit(): WeightUnit {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Converts a kg-denominated value (weight OR volume, both scale linearly) to the display unit. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? kgToLb(kg) : kg;
  return Math.round(value * 10) / 10;
}

/**
 * Converts a value entered in the display unit back to kg for storage.
 *
 * Rounded to 0.001kg, not 0.1kg: 0.1kg is ~0.22lb, so a coarser grid than the
 * 0.1lb the value is displayed at. Storing at 0.1kg made 219 of the first 400
 * integer lb values fail to round-trip — enter 135lb and the logged set read
 * back 134.9lb, enter 225lb and it read 225.1lb, and the error then carried
 * into the next set's prefill. Three decimals is finer than either display
 * unit, so whatever the user typed is what they see.
 */
export function toKgWeight(displayValue: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? lbToKg(displayValue) : displayValue;
  return Math.round(kg * 1000) / 1000;
}

/**
 * A typed weight, or null when the text isn't one. Every weight field goes
 * through this, so they agree on what counts:
 * - blank is not a weight. `Number("")` is 0, so a cleared field logged a
 *   real set at 0 kg.
 * - a comma decimal is. iOS shows only "," on the decimal keypad in comma
 *   locales, and `Number("62,5")` is NaN, so 62.5 could not be entered.
 * - nothing else is: `Number()` also accepts "0x14" (20) and "1e3".
 */
export function parseWeightInput(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  return /^(\d+(\.\d*)?|\.\d+)$/.test(normalised) ? Number(normalised) : null;
}

/**
 * The text a −/+ stepper shows after one step. Rounded, because binary floats
 * made 32.2 − 0.5 display as 31.700000000000003.
 */
export function stepNumberText(value: string, delta: number, min: number): string {
  const n = parseFloat(value.replace(",", "."));
  const next = Math.max(min, (Number.isFinite(n) ? n : 0) + delta);
  return String(Math.round(next * 1000) / 1000);
}

export function fmtWeight(kg: number, unit: WeightUnit): string {
  const value = toDisplayWeight(kg, unit);
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

interface WeightUnitContextValue {
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
}

const WeightUnitContext = createContext<WeightUnitContextValue | null>(null);

export function WeightUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(readStoredUnit);

  const setUnit = (u: WeightUnit) => {
    setUnitState(u);
    try {
      window.localStorage.setItem(STORAGE_KEY, u);
    } catch {
      // Applies for this session; it just will not be remembered.
    }
  };

  return (
    <WeightUnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </WeightUnitContext.Provider>
  );
}

export function useWeightUnit(): WeightUnitContextValue {
  const ctx = useContext(WeightUnitContext);
  if (!ctx) {
    throw new Error("useWeightUnit must be used within a WeightUnitProvider");
  }
  return ctx;
}

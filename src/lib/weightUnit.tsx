import { createContext, useContext, useState, type ReactNode } from "react";

export type WeightUnit = "kg" | "lb";

const STORAGE_KEY = "peak-weight-unit";
const KG_PER_LB = 0.45359237;

function readStoredUnit(): WeightUnit {
  return window.localStorage.getItem(STORAGE_KEY) === "lb" ? "lb" : "kg";
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

/** Converts a value entered in the display unit back to kg for storage. */
export function toKgWeight(displayValue: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? lbToKg(displayValue) : displayValue;
  return Math.round(kg * 10) / 10;
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
    window.localStorage.setItem(STORAGE_KEY, u);
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

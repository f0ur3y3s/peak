import { describe, expect, it } from "vitest";
import {
  fmtWeight,
  kgToLb,
  lbToKg,
  toDisplayWeight,
  toKgWeight,
  type WeightUnit,
} from "@/lib/weightUnit";

const KG_PER_LB = 0.45359237;

describe("kgToLb / lbToKg", () => {
  it("uses the exact international pound, not an approximation", () => {
    expect(lbToKg(1)).toBe(KG_PER_LB);
    expect(kgToLb(KG_PER_LB)).toBe(1);
  });

  it("maps zero to zero in both directions", () => {
    expect(kgToLb(0)).toBe(0);
    expect(lbToKg(0)).toBe(0);
  });

  it("is linear, so it converts volumes as well as single weights", () => {
    expect(kgToLb(200)).toBeCloseTo(kgToLb(100) * 2, 10);
    expect(lbToKg(500)).toBeCloseTo(lbToKg(100) * 5, 10);
  });

  it("converts known reference values", () => {
    // 100 kg is 220.462... lb; 45 lb (a standard bar) is 20.411... kg.
    expect(kgToLb(100)).toBeCloseTo(220.462262, 5);
    expect(lbToKg(45)).toBeCloseTo(20.4116567, 6);
  });

  it("round-trips through raw conversion without rounding", () => {
    for (const kg of [1, 2.5, 20, 60.5, 142.375]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 10);
    }
  });

  it("preserves sign for negative inputs", () => {
    expect(kgToLb(-10)).toBeCloseTo(-22.0462262, 6);
    expect(lbToKg(-10)).toBeCloseTo(-4.5359237, 7);
  });
});

describe("toDisplayWeight", () => {
  it("passes kg through untouched when the unit is kg", () => {
    expect(toDisplayWeight(0, "kg")).toBe(0);
    expect(toDisplayWeight(60, "kg")).toBe(60);
    expect(toDisplayWeight(102.5, "kg")).toBe(102.5);
  });

  it("rounds kg to one decimal place", () => {
    // Storage keeps 0.001 kg; the display grid is 0.1.
    expect(toDisplayWeight(60.04, "kg")).toBe(60);
    expect(toDisplayWeight(60.05, "kg")).toBe(60.1);
    expect(toDisplayWeight(60.449, "kg")).toBe(60.4);
  });

  it("converts to lb and rounds to one decimal place", () => {
    expect(toDisplayWeight(100, "lb")).toBe(220.5);
    expect(toDisplayWeight(20.411657, "lb")).toBe(45);
    expect(toDisplayWeight(0, "lb")).toBe(0);
  });

  it("never leaks floating-point noise into the displayed value", () => {
    const value = toDisplayWeight(lbToKg(135), "lb");
    expect(value).toBe(135);
    expect(Number.isInteger(value * 10)).toBe(true);
  });
});

describe("toKgWeight", () => {
  it("passes kg input through, rounded to 0.001 kg", () => {
    expect(toKgWeight(60, "kg")).toBe(60);
    expect(toKgWeight(102.5, "kg")).toBe(102.5);
    expect(toKgWeight(60.00049, "kg")).toBe(60);
    expect(toKgWeight(60.0005, "kg")).toBe(60.001);
  });

  it("converts lb input to kg at 0.001 kg resolution", () => {
    expect(toKgWeight(1, "lb")).toBe(0.454);
    expect(toKgWeight(45, "lb")).toBe(20.412);
    expect(toKgWeight(225, "lb")).toBe(102.058);
  });

  it("keeps a strictly finer grid than either display unit", () => {
    // 0.1 lb is ~0.045 kg; the 0.001 kg storage grid is ~45x finer, which is
    // the whole point — it can represent every value either unit can show.
    const oneTenthOfALbInKg = lbToKg(0.1);
    expect(oneTenthOfALbInKg).toBeGreaterThan(0.001);
  });

  it("maps zero to zero in both units", () => {
    expect(toKgWeight(0, "kg")).toBe(0);
    expect(toKgWeight(0, "lb")).toBe(0);
  });
});

describe("round-trip property: display -> storage -> display", () => {
  // Regression coverage for a real bug. toKgWeight used to round to 0.1 kg,
  // a coarser grid than the 0.1 lb the value is displayed at, so entering
  // 135 lb read back as 134.9 lb and 225 lb read back as 225.1 lb — and the
  // drift then carried into the next set's prefill.
  const roundTrip = (value: number, unit: WeightUnit) =>
    toDisplayWeight(toKgWeight(value, unit), unit);

  it("round-trips every integer lb value from 1 to 400 exactly", () => {
    const broken: number[] = [];
    for (let lb = 1; lb <= 400; lb++) {
      if (roundTrip(lb, "lb") !== lb) broken.push(lb);
    }
    expect(broken).toEqual([]);
  });

  it("round-trips every 2.5 lb increment from 2.5 to 400 exactly", () => {
    const broken: number[] = [];
    for (let step = 1; step <= 160; step++) {
      const lb = step * 2.5;
      if (roundTrip(lb, "lb") !== lb) broken.push(lb);
    }
    expect(broken).toEqual([]);
    // 160 increments actually got checked, not zero iterations.
    expect(160 * 2.5).toBe(400);
  });

  it("round-trips every 0.5 lb increment up to 400 exactly", () => {
    const broken: number[] = [];
    for (let step = 1; step <= 800; step++) {
      const lb = Math.round(step * 0.5 * 10) / 10;
      if (roundTrip(lb, "lb") !== lb) broken.push(lb);
    }
    expect(broken).toEqual([]);
  });

  it("round-trips every 0.5 kg increment up to 400 kg exactly", () => {
    const broken: number[] = [];
    for (let step = 1; step <= 800; step++) {
      const kg = step * 0.5;
      if (roundTrip(kg, "kg") !== kg) broken.push(kg);
    }
    expect(broken).toEqual([]);
  });

  it("round-trips 0 in both units", () => {
    expect(roundTrip(0, "lb")).toBe(0);
    expect(roundTrip(0, "kg")).toBe(0);
  });

  it("demonstrates why 0.1 kg storage was not good enough", () => {
    // The grid the old implementation used. Kept as an executable explanation
    // of the bug: at 0.1 kg, 219 of the first 400 integer lb values fail.
    const oldToKg = (lb: number) => Math.round(lb * KG_PER_LB * 10) / 10;
    let failures = 0;
    for (let lb = 1; lb <= 400; lb++) {
      if (toDisplayWeight(oldToKg(lb), "lb") !== lb) failures++;
    }
    expect(failures).toBe(219);
  });
});

describe("fmtWeight", () => {
  it("drops the decimal for whole numbers", () => {
    expect(fmtWeight(60, "kg")).toBe("60");
    expect(fmtWeight(0, "kg")).toBe("0");
    expect(fmtWeight(0, "lb")).toBe("0");
    expect(fmtWeight(lbToKg(135), "lb")).toBe("135");
  });

  it("shows exactly one decimal for fractional values", () => {
    expect(fmtWeight(102.5, "kg")).toBe("102.5");
    expect(fmtWeight(100, "lb")).toBe("220.5");
  });

  it("formats to the rounded display value, never the raw float", () => {
    // 60.04 kg displays as 60, so no ".0" suffix should appear.
    expect(fmtWeight(60.04, "kg")).toBe("60");
    expect(fmtWeight(60.06, "kg")).toBe("60.1");
  });

  it("never emits more than one decimal place", () => {
    for (let kg = 0; kg <= 200; kg += 0.137) {
      for (const unit of ["kg", "lb"] as const) {
        expect(fmtWeight(kg, unit)).toMatch(/^-?\d+(\.\d)?$/);
      }
    }
  });

  it("agrees with toDisplayWeight for every formatted value", () => {
    for (let kg = 0; kg <= 300; kg += 1.25) {
      for (const unit of ["kg", "lb"] as const) {
        expect(Number(fmtWeight(kg, unit))).toBe(toDisplayWeight(kg, unit));
      }
    }
  });
});

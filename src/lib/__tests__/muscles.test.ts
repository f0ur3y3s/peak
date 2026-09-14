import { describe, expect, it } from "vitest";
import { ALL_MUSCLES, MUSCLE_GROUPS, fuzzyMatch, groupForMuscle } from "@/lib/muscles";

describe("MUSCLE_GROUPS / ALL_MUSCLES", () => {
  it("flattens every group's muscles, in group order", () => {
    expect(ALL_MUSCLES).toEqual(MUSCLE_GROUPS.flatMap((g) => g.muscles));
    expect(ALL_MUSCLES.length).toBe(
      MUSCLE_GROUPS.reduce((n, g) => n + g.muscles.length, 0)
    );
  });

  it("has no duplicate muscle names across groups", () => {
    expect(new Set(ALL_MUSCLES).size).toBe(ALL_MUSCLES.length);
  });

  it("has no duplicate group names and no empty entries", () => {
    const groups = MUSCLE_GROUPS.map((g) => g.group);
    expect(new Set(groups).size).toBe(groups.length);
    for (const g of MUSCLE_GROUPS) {
      expect(g.group.trim()).not.toBe("");
      expect(g.muscles.length).toBeGreaterThan(0);
      for (const m of g.muscles) expect(m.trim()).not.toBe("");
    }
  });
});

describe("fuzzyMatch", () => {
  it("matches a contiguous prefix", () => {
    expect(fuzzyMatch("tri", "Triceps")).toBe(true);
    expect(fuzzyMatch("quad", "Quads")).toBe(true);
  });

  it("matches a contiguous substring anywhere in the target", () => {
    expect(fuzzyMatch("ceps", "Triceps")).toBe(true);
    expect(fuzzyMatch("delt", "Rear Delts")).toBe(true);
  });

  it("matches a non-contiguous subsequence, including initials", () => {
    expect(fuzzyMatch("lb", "Lower Back")).toBe(true);
    expect(fuzzyMatch("uc", "Upper Chest")).toBe(true);
    expect(fuzzyMatch("rd", "Rear Delts")).toBe(true);
    expect(fuzzyMatch("hms", "Hamstrings")).toBe(true);
  });

  it("requires the query characters in order", () => {
    expect(fuzzyMatch("ceps", "Triceps")).toBe(true);
    expect(fuzzyMatch("spec", "Triceps")).toBe(false);
    expect(fuzzyMatch("bl", "Lower Back")).toBe(false);
  });

  it("is case-insensitive in both the query and the target", () => {
    expect(fuzzyMatch("TRI", "Triceps")).toBe(true);
    expect(fuzzyMatch("tri", "TRICEPS")).toBe(true);
    expect(fuzzyMatch("TrIcEpS", "triceps")).toBe(true);
    expect(fuzzyMatch("LB", "lower back")).toBe(true);
  });

  it("treats an empty or whitespace-only query as matching everything", () => {
    expect(fuzzyMatch("", "Triceps")).toBe(true);
    expect(fuzzyMatch("   ", "Triceps")).toBe(true);
    expect(fuzzyMatch("\t\n", "Triceps")).toBe(true);
    expect(fuzzyMatch("", "")).toBe(true);
    for (const muscle of ALL_MUSCLES) {
      expect(fuzzyMatch("", muscle)).toBe(true);
    }
  });

  it("trims surrounding whitespace off the query", () => {
    expect(fuzzyMatch("  tri  ", "Triceps")).toBe(true);
    expect(fuzzyMatch("\tlats\n", "Lats")).toBe(true);
  });

  it("keeps interior spaces significant", () => {
    expect(fuzzyMatch("l b", "Lower Back")).toBe(true);
    expect(fuzzyMatch("lower back", "Lower Back")).toBe(true);
    // No space in "Lats", so a query containing one cannot match it.
    expect(fuzzyMatch("l a", "Lats")).toBe(false);
  });

  it("returns false when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Biceps")).toBe(false);
    expect(fuzzyMatch("chest", "Lats")).toBe(false);
    expect(fuzzyMatch("q", "Biceps")).toBe(false);
  });

  it("returns false when a non-empty query cannot fit the target", () => {
    expect(fuzzyMatch("triceps and more", "Triceps")).toBe(false);
    expect(fuzzyMatch("a", "")).toBe(false);
  });

  it("matches a target against itself and against its own lowercase form", () => {
    for (const muscle of ALL_MUSCLES) {
      expect(fuzzyMatch(muscle, muscle)).toBe(true);
      expect(fuzzyMatch(muscle.toLowerCase(), muscle)).toBe(true);
      expect(fuzzyMatch(muscle.toUpperCase(), muscle)).toBe(true);
    }
  });

  it("narrows the picker: 'tri' hits Triceps and nothing unrelated", () => {
    const hits = ALL_MUSCLES.filter((m) => fuzzyMatch("tri", m));
    expect(hits).toContain("Triceps");
    expect(hits).not.toContain("Biceps");
    expect(hits).not.toContain("Quads");
  });
});

describe("groupForMuscle", () => {
  it("maps a specific muscle to its broad group", () => {
    expect(groupForMuscle("Biceps")).toBe("Arms");
    expect(groupForMuscle("Triceps")).toBe("Arms");
    expect(groupForMuscle("Forearms")).toBe("Arms");
    expect(groupForMuscle("Lats")).toBe("Back");
    expect(groupForMuscle("Lower Back")).toBe("Back");
    expect(groupForMuscle("Quads")).toBe("Legs");
    expect(groupForMuscle("Calves")).toBe("Legs");
    expect(groupForMuscle("Side Delts")).toBe("Shoulders");
    expect(groupForMuscle("Upper Chest")).toBe("Chest");
    expect(groupForMuscle("Obliques")).toBe("Core");
  });

  it("maps a broad group name to itself", () => {
    for (const { group } of MUSCLE_GROUPS) {
      expect(groupForMuscle(group)).toBe(group);
    }
  });

  it('resolves "Chest", which is both a group name and a muscle, to the group', () => {
    expect(groupForMuscle("Chest")).toBe("Chest");
  });

  it("maps every muscle in the taxonomy to the group that declares it", () => {
    for (const { group, muscles } of MUSCLE_GROUPS) {
      for (const muscle of muscles) {
        expect(groupForMuscle(muscle)).toBe(group);
      }
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(groupForMuscle("biceps")).toBe("Arms");
    expect(groupForMuscle("BICEPS")).toBe("Arms");
    expect(groupForMuscle("  quads  ")).toBe("Legs");
    expect(groupForMuscle("\tlower back\n")).toBe("Back");
    expect(groupForMuscle("legs")).toBe("Legs");
  });

  it('falls back to "Other" for anything outside the taxonomy', () => {
    expect(groupForMuscle("Neck")).toBe("Other");
    expect(groupForMuscle("Grip")).toBe("Other");
    expect(groupForMuscle("Cardio")).toBe("Other");
    expect(groupForMuscle("Bicep")).toBe("Other");
    expect(groupForMuscle("")).toBe("Other");
    expect(groupForMuscle("   ")).toBe("Other");
  });

  it("requires a whole-string match, not a fuzzy or partial one", () => {
    // Unlike fuzzyMatch, grouping is exact — a near-miss must not be absorbed
    // into a group it does not belong to.
    expect(groupForMuscle("bi")).toBe("Other");
    expect(groupForMuscle("Biceps Brachii")).toBe("Other");
    expect(groupForMuscle("Upper")).toBe("Other");
  });

  it("only ever returns a known group name or Other", () => {
    const valid = new Set([...MUSCLE_GROUPS.map((g) => g.group), "Other"]);
    for (const input of [...ALL_MUSCLES, "Neck", "", "Legs", "unknown thing"]) {
      expect(valid.has(groupForMuscle(input))).toBe(true);
    }
  });
});

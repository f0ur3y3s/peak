import { describe, expect, it } from "vitest";
import { ALL_MUSCLES } from "@/lib/muscles";
import {
  PROGRAM_SEED_VERSION,
  PROGRAM_SEED_WEIGHT,
  SEED_PROGRAM,
  type SeedProgramExercise,
} from "@/lib/seedProgram";

const allExercises: SeedProgramExercise[] = SEED_PROGRAM.flatMap((t) => t.exercises);

/** [templateName, template] pairs, for readable per-template failures. */
const templateCases = SEED_PROGRAM.map((t) => [t.name, t] as const);

/** [exerciseName, exercise, templateName] triples. */
const exerciseCases = SEED_PROGRAM.flatMap((t) =>
  t.exercises.map((ex) => [`${t.name} / ${ex.name}`, ex] as const)
);

describe("SEED_PROGRAM shape", () => {
  it("is the 5-day Push/Pull/Legs split, in order", () => {
    expect(SEED_PROGRAM.map((t) => t.name)).toEqual([
      "Push A",
      "Pull A",
      "Legs",
      "Push B",
      "Pull B",
    ]);
  });

  it("seeds 31 exercises in total, and no template is empty", () => {
    expect(allExercises).toHaveLength(31);
    for (const t of SEED_PROGRAM) {
      expect(t.exercises.length).toBeGreaterThan(0);
    }
  });

  it("seeds all loads at zero, because loads are personal", () => {
    expect(PROGRAM_SEED_WEIGHT).toBe(0);
  });

  it("carries a non-empty seed version marker", () => {
    expect(PROGRAM_SEED_VERSION.trim()).not.toBe("");
  });
});

describe("id integrity", () => {
  it("has no duplicate ids across templates AND exercises combined", () => {
    // Seed ids are deterministic and shared between IndexedDB, the sync
    // upsert and migration 008, so a collision anywhere would silently make
    // two records converge onto one row.
    const ids = [...SEED_PROGRAM.map((t) => t.id), ...allExercises.map((ex) => ex.id)];
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    expect(duplicates).toEqual([]);
    expect(ids).toHaveLength(SEED_PROGRAM.length + allExercises.length);
  });

  it("references every exercise id from exactly one template", () => {
    const owners = new Map<string, string[]>();
    for (const t of SEED_PROGRAM) {
      for (const ex of t.exercises) {
        owners.set(ex.id, [...(owners.get(ex.id) ?? []), t.id]);
      }
    }
    const shared = [...owners].filter(([, ts]) => ts.length !== 1);
    expect(shared).toEqual([]);
    expect(owners.size).toBe(allExercises.length);
  });

  it("gives every id a non-empty, whitespace-free, namespaced value", () => {
    for (const t of SEED_PROGRAM) {
      expect(t.id).toMatch(/^ppl-v1-[a-z0-9-]+$/);
    }
    for (const ex of allExercises) {
      expect(ex.id).toMatch(/^ppl-v1-ex-[a-z0-9-]+$/);
    }
  });

  it("keeps template and exercise names unique, since the library dedupes by name", () => {
    const templateNames = SEED_PROGRAM.map((t) => t.name);
    const exerciseNames = allExercises.map((ex) => ex.name);
    expect(new Set(templateNames).size).toBe(templateNames.length);
    expect(new Set(exerciseNames).size).toBe(exerciseNames.length);
  });
});

describe("template invariants", () => {
  it.each(templateCases)("%s has a non-empty name", (_name, template) => {
    expect(template.name.trim()).not.toBe("");
  });

  it.each(templateCases)("%s has a non-empty note", (_name, template) => {
    expect(typeof template.notes).toBe("string");
    expect(template.notes.trim()).not.toBe("");
  });
});

describe("exercise invariants", () => {
  it.each(exerciseCases)("%s has a non-empty name", (_label, ex) => {
    expect(ex.name.trim()).not.toBe("");
  });

  it.each(exerciseCases)("%s has a non-empty note", (_label, ex) => {
    expect(typeof ex.notes).toBe("string");
    expect(ex.notes.trim()).not.toBe("");
  });

  it.each(exerciseCases)("%s has repsMin <= repsMax, both positive", (_label, ex) => {
    expect(Number.isInteger(ex.repsMin)).toBe(true);
    expect(Number.isInteger(ex.repsMax)).toBe(true);
    expect(ex.repsMin).toBeGreaterThan(0);
    expect(ex.repsMin).toBeLessThanOrEqual(ex.repsMax);
  });

  it.each(exerciseCases)("%s has targetSets > 0", (_label, ex) => {
    expect(Number.isInteger(ex.targetSets)).toBe(true);
    expect(ex.targetSets).toBeGreaterThan(0);
  });

  it.each(exerciseCases)("%s has restSeconds > 0", (_label, ex) => {
    expect(Number.isInteger(ex.restSeconds)).toBe(true);
    expect(ex.restSeconds).toBeGreaterThan(0);
  });

  it.each(exerciseCases)("%s targets a muscle in the taxonomy", (_label, ex) => {
    // A muscle outside src/lib/muscles.ts would land the exercise in the
    // "Other" bucket in every grouped list and in the muscle picker.
    expect(ALL_MUSCLES).toContain(ex.muscle);
  });
});

describe("program-wide sanity", () => {
  it("keeps every rest interval within a plausible training range", () => {
    for (const ex of allExercises) {
      expect(ex.restSeconds).toBeGreaterThanOrEqual(30);
      expect(ex.restSeconds).toBeLessThanOrEqual(600);
    }
  });

  it("keeps every rep range within a plausible training range", () => {
    for (const ex of allExercises) {
      expect(ex.repsMax).toBeLessThanOrEqual(50);
      expect(ex.targetSets).toBeLessThanOrEqual(10);
    }
  });

  it("covers all six broad muscle groups across the week", () => {
    const muscles = new Set(allExercises.map((ex) => ex.muscle));
    expect(muscles.size).toBeGreaterThanOrEqual(10);
  });
});

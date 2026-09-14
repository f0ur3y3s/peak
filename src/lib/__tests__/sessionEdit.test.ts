import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalData,
  deleteWorkoutSession,
  getSyncTombstones,
  getWorkoutSession,
  recomputeSessionPRs,
  saveWorkoutSession,
  type WorkoutSession,
} from "@/lib/db";

function session(
  id: string,
  startedAt: number,
  exercises: { name: string; sets: { reps: number; weight: number }[] }[]
): WorkoutSession {
  return {
    id,
    templateName: "Push A",
    startedAt,
    finishedAt: startedAt + 3_600_000,
    exercises,
    prs: [],
    updatedAt: startedAt,
  };
}

beforeEach(async () => {
  await clearLocalData();
});
afterEach(async () => {
  await clearLocalData();
});

describe("deleteWorkoutSession", () => {
  it("removes it and leaves a tombstone so the delete reaches other devices", async () => {
    await saveWorkoutSession(session("s1", 1_000, []));

    await deleteWorkoutSession("s1");

    expect(await getWorkoutSession("s1")).toBeUndefined();
    expect(await getSyncTombstones()).toContainEqual(
      expect.objectContaining({ store: "workout_sessions", id: "s1" })
    );
  });

  it("clears a stale tombstone if that id is written again", async () => {
    // A pulled copy of a session deleted here would otherwise be marked
    // deleted remotely on the next push, by a tombstone that has been
    // superseded.
    await saveWorkoutSession(session("s1", 1_000, []));
    await deleteWorkoutSession("s1");
    await saveWorkoutSession(session("s1", 1_000, []));

    expect(await getSyncTombstones()).toHaveLength(0);
  });
});

describe("recomputeSessionPRs", () => {
  const history = [
    session("old", 1_000, [{ name: "Bench", sets: [{ reps: 5, weight: 100 }] }]),
    session("mid", 2_000, [{ name: "Bench", sets: [{ reps: 5, weight: 110 }] }]),
  ];

  it("flags an exercise that beats everything before it", () => {
    const edited = session("new", 3_000, [{ name: "Bench", sets: [{ reps: 5, weight: 115 }] }]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toEqual(["Bench"]);
  });

  it("drops the flag when the weight is corrected downwards", () => {
    // The whole point: 120 typed where 20 was meant left a PR badge and a
    // chart spike that no correction could remove.
    const edited = session("new", 3_000, [{ name: "Bench", sets: [{ reps: 5, weight: 20 }] }]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toEqual([]);
  });

  it("ignores sessions that came after it", () => {
    // The badge means "this was a best when you did it" — a heavier session
    // next month does not retroactively unmake that.
    const edited = session("mid2", 2_500, [{ name: "Bench", sets: [{ reps: 5, weight: 112 }] }]);
    const later = session("later", 9_000, [{ name: "Bench", sets: [{ reps: 5, weight: 200 }] }]);
    expect(recomputeSessionPRs(edited, [...history, edited, later])).toEqual(["Bench"]);
  });

  it("does not count the session against itself", () => {
    const edited = session("new", 3_000, [{ name: "Bench", sets: [{ reps: 5, weight: 115 }] }]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toContain("Bench");
  });

  it("compares each exercise on its own", () => {
    const edited = session("new", 3_000, [
      { name: "Bench", sets: [{ reps: 5, weight: 105 }] },
      { name: "Row", sets: [{ reps: 8, weight: 60 }] },
    ]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toEqual(["Row"]);
  });

  it("skips an exercise left with no sets", () => {
    const edited = session("new", 3_000, [{ name: "Bench", sets: [] }]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toEqual([]);
  });

  it("ties do not count — a PR has to beat the old number", () => {
    const edited = session("new", 3_000, [{ name: "Bench", sets: [{ reps: 8, weight: 110 }] }]);
    expect(recomputeSessionPRs(edited, [...history, edited])).toEqual([]);
  });
});

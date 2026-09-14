// Pure helpers from src/lib/db.ts only — sessionVolume, sessionSetCount and
// groupSessionsByExercise never touch IndexedDB. The module does import `idb`
// at the top level though, so fake-indexeddb/auto installs a global
// `indexedDB` first; without it, importing this module under `node` would
// depend on the host happening to provide one.
import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";
import {
  groupSessionsByExercise,
  sessionSetCount,
  sessionVolume,
  type WorkoutSession,
} from "@/lib/db";

type SetSpec = { reps: number; weight: number };

let nextId = 0;

function makeSession(
  exercises: { name: string; sets: SetSpec[] }[],
  overrides: Partial<WorkoutSession> = {}
): WorkoutSession {
  const startedAt = overrides.startedAt ?? 1_700_000_000_000;
  return {
    id: `s${nextId++}`,
    templateName: "Push A",
    startedAt,
    finishedAt: startedAt + 3_600_000,
    exercises,
    prs: [],
    updatedAt: startedAt,
    ...overrides,
  };
}

describe("sessionVolume", () => {
  it("sums reps x weight across every set of every exercise", () => {
    const session = makeSession([
      { name: "Bench Press", sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }] },
      { name: "Dips", sets: [{ reps: 10, weight: 20 }] },
    ]);
    expect(sessionVolume(session)).toBe(5 * 100 + 5 * 100 + 10 * 20);
  });

  it("returns 0 for a session with no exercises", () => {
    expect(sessionVolume(makeSession([]))).toBe(0);
  });

  it("returns 0 when every exercise has an empty set list", () => {
    expect(
      sessionVolume(
        makeSession([
          { name: "Bench Press", sets: [] },
          { name: "Dips", sets: [] },
        ])
      )
    ).toBe(0);
  });

  it("counts bodyweight sets (weight 0) as zero volume without skipping them", () => {
    const session = makeSession([
      { name: "Push-Up", sets: [{ reps: 20, weight: 0 }] },
      { name: "Bench Press", sets: [{ reps: 8, weight: 60 }] },
    ]);
    expect(sessionVolume(session)).toBe(480);
  });

  it("handles fractional kg loads", () => {
    const session = makeSession([
      { name: "Lateral Raise", sets: [{ reps: 12, weight: 7.5 }, { reps: 12, weight: 7.5 }] },
    ]);
    expect(sessionVolume(session)).toBe(180);
  });

  it("ignores exercises with empty sets while summing the rest", () => {
    const session = makeSession([
      { name: "Skipped", sets: [] },
      { name: "Leg Press", sets: [{ reps: 10, weight: 200 }] },
      { name: "Also Skipped", sets: [] },
    ]);
    expect(sessionVolume(session)).toBe(2000);
  });

  it("does not mutate the session it is given", () => {
    const session = makeSession([
      { name: "Bench Press", sets: [{ reps: 5, weight: 100 }] },
    ]);
    const before = JSON.stringify(session);
    sessionVolume(session);
    expect(JSON.stringify(session)).toBe(before);
  });
});

describe("sessionSetCount", () => {
  it("counts every logged set across exercises", () => {
    const session = makeSession([
      { name: "Bench Press", sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }] },
      { name: "Dips", sets: [{ reps: 10, weight: 0 }] },
    ]);
    expect(sessionSetCount(session)).toBe(3);
  });

  it("returns 0 for an empty session and for all-empty set lists", () => {
    expect(sessionSetCount(makeSession([]))).toBe(0);
    expect(
      sessionSetCount(makeSession([{ name: "Bench Press", sets: [] }]))
    ).toBe(0);
  });

  it("counts sets, not exercises", () => {
    const session = makeSession([
      { name: "A", sets: [{ reps: 1, weight: 1 }] },
      { name: "B", sets: [{ reps: 1, weight: 1 }, { reps: 1, weight: 1 }, { reps: 1, weight: 1 }] },
    ]);
    expect(sessionSetCount(session)).toBe(4);
    expect(session.exercises).toHaveLength(2);
  });

  it("counts zero-rep and zero-weight sets, which still happened", () => {
    const session = makeSession([
      { name: "Warm-up", sets: [{ reps: 0, weight: 0 }, { reps: 0, weight: 0 }] },
    ]);
    expect(sessionSetCount(session)).toBe(2);
    expect(sessionVolume(session)).toBe(0);
  });
});

describe("groupSessionsByExercise", () => {
  it("returns an empty object for no sessions", () => {
    expect(groupSessionsByExercise([])).toEqual({});
  });

  it("keys the result by exercise name", () => {
    const grouped = groupSessionsByExercise([
      makeSession([
        { name: "Bench Press", sets: [{ reps: 5, weight: 100 }] },
        { name: "Dips", sets: [{ reps: 10, weight: 20 }] },
      ]),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["Bench Press", "Dips"]);
  });

  it("records peak as the heaviest set and vol as total reps x weight", () => {
    const grouped = groupSessionsByExercise([
      makeSession(
        [
          {
            name: "Bench Press",
            sets: [
              { reps: 8, weight: 60 },
              { reps: 5, weight: 100 },
              { reps: 3, weight: 90 },
            ],
          },
        ],
        { startedAt: 1000 }
      ),
    ]);
    expect(grouped["Bench Press"]).toEqual([
      { t: 1000, peak: 100, vol: 8 * 60 + 5 * 100 + 3 * 90 },
    ]);
  });

  it("uses startedAt (not finishedAt) as the point's timestamp", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Dips", sets: [{ reps: 10, weight: 0 }] }], {
        startedAt: 5000,
        finishedAt: 9999,
      }),
    ]);
    expect(grouped["Dips"][0].t).toBe(5000);
  });

  it("collects one point per session for an exercise repeated across sessions", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Bench Press", sets: [{ reps: 5, weight: 100 }] }], {
        startedAt: 1000,
      }),
      makeSession([{ name: "Bench Press", sets: [{ reps: 5, weight: 102.5 }] }], {
        startedAt: 2000,
      }),
      makeSession([{ name: "Bench Press", sets: [{ reps: 5, weight: 105 }] }], {
        startedAt: 3000,
      }),
    ]);
    expect(grouped["Bench Press"].map((p) => p.peak)).toEqual([100, 102.5, 105]);
  });

  it("sorts points ascending by time even when sessions arrive newest-first", () => {
    // getWorkoutSessions() returns newest-first, so this is the real input
    // order for the progression chart.
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Squat", sets: [{ reps: 5, weight: 140 }] }], { startedAt: 3000 }),
      makeSession([{ name: "Squat", sets: [{ reps: 5, weight: 120 }] }], { startedAt: 1000 }),
      makeSession([{ name: "Squat", sets: [{ reps: 5, weight: 130 }] }], { startedAt: 2000 }),
    ]);
    expect(grouped["Squat"].map((p) => p.t)).toEqual([1000, 2000, 3000]);
    expect(grouped["Squat"].map((p) => p.peak)).toEqual([120, 130, 140]);
  });

  it("sorts every exercise's series independently", () => {
    const grouped = groupSessionsByExercise([
      makeSession(
        [
          { name: "Squat", sets: [{ reps: 5, weight: 140 }] },
          { name: "Curl", sets: [{ reps: 10, weight: 20 }] },
        ],
        { startedAt: 3000 }
      ),
      makeSession(
        [
          { name: "Squat", sets: [{ reps: 5, weight: 120 }] },
          { name: "Curl", sets: [{ reps: 10, weight: 15 }] },
        ],
        { startedAt: 1000 }
      ),
    ]);
    expect(grouped["Squat"].map((p) => p.t)).toEqual([1000, 3000]);
    expect(grouped["Curl"].map((p) => p.t)).toEqual([1000, 3000]);
  });

  it("skips exercises whose set list is empty", () => {
    const grouped = groupSessionsByExercise([
      makeSession([
        { name: "Bench Press", sets: [{ reps: 5, weight: 100 }] },
        { name: "Never Logged", sets: [] },
      ]),
    ]);
    expect(Object.keys(grouped)).toEqual(["Bench Press"]);
    expect(grouped["Never Logged"]).toBeUndefined();
  });

  it("does not create a key for an exercise that is empty in every session", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Planned Only", sets: [] }], { startedAt: 1000 }),
      makeSession([{ name: "Planned Only", sets: [] }], { startedAt: 2000 }),
    ]);
    expect(grouped).toEqual({});
  });

  it("keeps only the sessions where an exercise was actually logged", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Dips", sets: [] }], { startedAt: 1000 }),
      makeSession([{ name: "Dips", sets: [{ reps: 10, weight: 0 }] }], { startedAt: 2000 }),
      makeSession([{ name: "Dips", sets: [] }], { startedAt: 3000 }),
    ]);
    expect(grouped["Dips"]).toEqual([{ t: 2000, peak: 0, vol: 0 }]);
  });

  it("treats a bodyweight exercise as peak 0 rather than dropping it", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Push-Up", sets: [{ reps: 20, weight: 0 }, { reps: 15, weight: 0 }] }], {
        startedAt: 1000,
      }),
    ]);
    expect(grouped["Push-Up"]).toEqual([{ t: 1000, peak: 0, vol: 0 }]);
  });

  it("treats exercise names as case- and whitespace-sensitive keys", () => {
    const grouped = groupSessionsByExercise([
      makeSession([
        { name: "Bench Press", sets: [{ reps: 5, weight: 100 }] },
        { name: "bench press", sets: [{ reps: 5, weight: 90 }] },
      ]),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["Bench Press", "bench press"]);
  });

  it("keeps two same-timestamp points rather than collapsing them", () => {
    const grouped = groupSessionsByExercise([
      makeSession([{ name: "Row", sets: [{ reps: 5, weight: 80 }] }], { startedAt: 1000 }),
      makeSession([{ name: "Row", sets: [{ reps: 5, weight: 85 }] }], { startedAt: 1000 }),
    ]);
    expect(grouped["Row"]).toHaveLength(2);
    expect(grouped["Row"].map((p) => p.peak).sort()).toEqual([80, 85]);
  });

  it("does not mutate the sessions it is given", () => {
    const sessions = [
      makeSession([{ name: "Squat", sets: [{ reps: 5, weight: 140 }] }], { startedAt: 3000 }),
      makeSession([{ name: "Squat", sets: [{ reps: 5, weight: 120 }] }], { startedAt: 1000 }),
    ];
    const before = JSON.stringify(sessions);
    groupSessionsByExercise(sessions);
    expect(JSON.stringify(sessions)).toBe(before);
  });

  it("agrees with sessionVolume when a session has a single exercise", () => {
    const session = makeSession(
      [
        {
          name: "Leg Press",
          sets: [
            { reps: 10, weight: 200 },
            { reps: 8, weight: 220 },
          ],
        },
      ],
      { startedAt: 1000 }
    );
    const grouped = groupSessionsByExercise([session]);
    expect(grouped["Leg Press"][0].vol).toBe(sessionVolume(session));
  });
});

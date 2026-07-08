import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SEED_EXERCISES, type Exercise } from "@/lib/data";

export interface WorkoutSession {
  id: string;
  templateName: string;
  startedAt: number;
  finishedAt: number;
  exercises: {
    name: string;
    sets: { reps: number; weight: number }[];
  }[];
  prs: string[];
}

interface ExerciseRecord {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

interface PeakDB extends DBSchema {
  exercises: {
    key: string;
    value: ExerciseRecord;
    indexes: { muscle: string };
  };
  workout_sessions: {
    key: string;
    value: WorkoutSession;
    indexes: { startedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<PeakDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PeakDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PeakDB>("peak-db", 1, {
      upgrade(db) {
        const exerciseStore = db.createObjectStore("exercises", { keyPath: "id" });
        exerciseStore.createIndex("muscle", "muscle");

        const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
        sessionStore.createIndex("startedAt", "startedAt");

        for (const ex of SEED_EXERCISES) {
          exerciseStore.put({
            id: ex.id,
            name: ex.name,
            muscle: ex.muscle,
            targetSets: ex.targetSets,
            repsMin: ex.repsMin,
            repsMax: ex.repsMax,
            targetWeight: ex.targetWeight,
            restSeconds: ex.restSeconds,
          });
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function lastSetsFor(exerciseName: string): Promise<{ r: number; w: number }[] | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  for (let i = sessions.length - 1; i >= 0; i--) {
    const match = sessions[i].exercises.find((e) => e.name === exerciseName);
    if (match) {
      return match.sets.map((s) => ({ r: s.reps, w: s.weight }));
    }
  }
  return null;
}

export async function getExercises(): Promise<Exercise[]> {
  const db = await getDB();
  const records = await db.getAll("exercises");
  const result: Exercise[] = [];
  for (const rec of records) {
    result.push({
      ...rec,
      last: await lastSetsFor(rec.name),
      logged: [],
    });
  }
  return result;
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  const db = await getDB();
  await db.put("workout_sessions", session);
}

export async function getWorkoutSessions(limit?: number): Promise<WorkoutSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  sessions.reverse();
  return limit ? sessions.slice(0, limit) : sessions;
}

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
    0
  );
}

export function sessionSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
}

export async function getPR(exerciseName: string): Promise<number> {
  const db = await getDB();
  const sessions = await db.getAll("workout_sessions");
  let best = 0;
  for (const session of sessions) {
    const match = session.exercises.find((e) => e.name === exerciseName);
    if (match) {
      for (const set of match.sets) {
        if (set.weight > best) best = set.weight;
      }
    }
  }
  return best;
}

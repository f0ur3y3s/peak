import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SEED_EXERCISES, type Exercise } from "@/lib/data";

export interface WorkoutSession {
  id: string;
  templateId?: string;
  templateName: string;
  startedAt: number;
  finishedAt: number;
  exercises: {
    name: string;
    sets: { reps: number; weight: number }[];
  }[];
  prs: string[];
}

export interface LibraryExercise {
  id: string;
  name: string;
  muscle: string;
}

export interface TemplateExerciseConfig {
  exerciseId: string;
  order: number;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  restSeconds: number;
}

export interface Template {
  id: string;
  name: string;
  exercises: TemplateExerciseConfig[];
}

interface ExerciseRecordV1 {
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
  exercise_library: {
    key: string;
    value: LibraryExercise;
  };
  templates: {
    key: string;
    value: Template;
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
    dbPromise = openDB<PeakDB>("peak-db", 2, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
          sessionStore.createIndex("startedAt", "startedAt");
        }

        if (oldVersion < 2) {
          const libraryStore = db.createObjectStore("exercise_library", { keyPath: "id" });
          const templateStore = db.createObjectStore("templates", { keyPath: "id" });

          if (oldVersion === 1) {
            // "exercises" is no longer part of the typed v2 schema (removed below),
            // so we reach it through the raw transaction for this one-time migration.
            //
            // Note: `transaction` here is idb's own Proxy-wrapped IDBTransaction (idb
            // wraps it before handing it to `upgrade()`), so the cast below doesn't
            // change the runtime object. That means `.objectStore(...).getAll()` is
            // *also* proxied by idb and already returns a Promise (idb auto-promisifies
            // any IDBRequest an intercepted method returns) rather than a raw
            // IDBRequest — so we await it directly instead of re-wrapping it in our own
            // onsuccess/onerror-based promisifier, which would never fire against an
            // already-resolved-via-Promise value and would silently hang the upgrade
            // (dropping all exercise/template data while the DB version still advances).
            const rawTx = transaction as unknown as IDBTransaction;
            const oldStore = rawTx.objectStore("exercises");
            const oldRecords = (await oldStore.getAll()) as unknown as ExerciseRecordV1[];

            for (const rec of oldRecords) {
              libraryStore.put({ id: rec.id, name: rec.name, muscle: rec.muscle });
            }

            templateStore.put({
              id: crypto.randomUUID(),
              name: "Push Day A",
              exercises: oldRecords.map((rec, i) => ({
                exerciseId: rec.id,
                order: i,
                targetSets: rec.targetSets,
                repsMin: rec.repsMin,
                repsMax: rec.repsMax,
                targetWeight: rec.targetWeight,
                restSeconds: rec.restSeconds,
              })),
            });

            // Same reasoning as `rawTx` above — "exercises" is no longer a
            // known store name in the typed v2 schema.
            (db as unknown as IDBDatabase).deleteObjectStore("exercises");
          } else {
            for (const ex of SEED_EXERCISES) {
              libraryStore.put({ id: ex.id, name: ex.name, muscle: ex.muscle });
            }
            templateStore.put({
              id: crypto.randomUUID(),
              name: "Push Day A",
              exercises: SEED_EXERCISES.map((ex, i) => ({
                exerciseId: ex.id,
                order: i,
                targetSets: ex.targetSets,
                repsMin: ex.repsMin,
                repsMax: ex.repsMax,
                targetWeight: ex.targetWeight,
                restSeconds: ex.restSeconds,
              })),
            });
          }
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

export async function getTemplates(): Promise<Template[]> {
  const db = await getDB();
  return db.getAll("templates");
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const db = await getDB();
  return db.get("templates", id);
}

export async function saveTemplate(template: Template): Promise<void> {
  const db = await getDB();
  await db.put("templates", template);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("templates", id);
}

export async function getExerciseLibrary(): Promise<LibraryExercise[]> {
  const db = await getDB();
  return db.getAll("exercise_library");
}

export async function saveLibraryExercise(exercise: LibraryExercise): Promise<void> {
  const db = await getDB();
  await db.put("exercise_library", exercise);
}

export async function deleteLibraryExercise(
  id: string
): Promise<{ ok: true } | { ok: false; usedIn: string[] }> {
  const db = await getDB();
  const templates = await db.getAll("templates");
  const usedIn = templates
    .filter((t) => t.exercises.some((e) => e.exerciseId === id))
    .map((t) => t.name);
  if (usedIn.length > 0) {
    return { ok: false, usedIn };
  }
  await db.delete("exercise_library", id);
  return { ok: true };
}

export async function getExercises(templateId: string): Promise<Exercise[]> {
  const db = await getDB();
  const template = await db.get("templates", templateId);
  if (!template) return [];
  const library = await db.getAll("exercise_library");
  const libraryById = new Map(library.map((l) => [l.id, l]));

  const result: Exercise[] = [];
  const sorted = [...template.exercises].sort((a, b) => a.order - b.order);
  for (const cfg of sorted) {
    const lib = libraryById.get(cfg.exerciseId);
    if (!lib) continue;
    result.push({
      id: cfg.exerciseId,
      name: lib.name,
      muscle: lib.muscle,
      targetSets: cfg.targetSets,
      repsMin: cfg.repsMin,
      repsMax: cfg.repsMax,
      targetWeight: cfg.targetWeight,
      restSeconds: cfg.restSeconds,
      last: await lastSetsFor(lib.name),
      logged: [],
    });
  }
  return result;
}

export async function getLastUsedTemplateId(): Promise<string | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workout_sessions", "startedAt");
  const templates = await db.getAll("templates");
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    if (session.templateId) {
      const match = templates.find((t) => t.id === session.templateId);
      if (match) return match.id;
      continue;
    }
    const match = templates.find((t) => t.name === session.templateName);
    if (match) return match.id;
  }
  if (templates.length === 0) return null;
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0].id;
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

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
  updatedAt: number;
}

export interface LibraryExercise {
  id: string;
  name: string;
  muscle: string;
  updatedAt: number;
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
  updatedAt: number;
}

export interface ActiveWorkoutDraft {
  id: "current";
  templateId: string;
  templateName: string;
  startedAt: number;
  exercises: {
    exerciseId: string;
    logged: { id: string; reps: number; weight: number }[];
  }[];
  updatedAt: number;
}

/** One row per locally-deleted record, consulted by the sync engine to
 * propagate the deletion as a soft-delete remotely, then cleared. */
export interface SyncTombstone {
  key: string; // `${store}:${id}`
  store: "templates" | "exercise_library" | "active_workout_draft";
  id: string;
  deletedAt: number;
}

interface SyncMetaRecord {
  key: "lastSyncedAt";
  value: number;
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
  active_workout_draft: {
    key: string;
    value: ActiveWorkoutDraft;
  };
  sync_tombstones: {
    key: string;
    value: SyncTombstone;
  };
  sync_meta: {
    key: string;
    value: SyncMetaRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PeakDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PeakDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PeakDB>("peak-db", 4, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore("workout_sessions", { keyPath: "id" });
          sessionStore.createIndex("startedAt", "startedAt");
        }

        if (oldVersion < 2) {
          const libraryStore = db.createObjectStore("exercise_library", { keyPath: "id" });
          const templateStore = db.createObjectStore("templates", { keyPath: "id" });

          if (oldVersion === 1) {
            // "exercises" is no longer part of the typed v2+ schema (removed below),
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
              libraryStore.put({ id: rec.id, name: rec.name, muscle: rec.muscle, updatedAt: Date.now() });
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
              updatedAt: Date.now(),
            });

            // Same reasoning as `rawTx` above — "exercises" is no longer a
            // known store name in the typed v2+ schema.
            (db as unknown as IDBDatabase).deleteObjectStore("exercises");
          } else {
            for (const ex of SEED_EXERCISES) {
              libraryStore.put({ id: ex.id, name: ex.name, muscle: ex.muscle, updatedAt: Date.now() });
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
              updatedAt: Date.now(),
            });
          }
        }

        if (oldVersion < 3) {
          db.createObjectStore("active_workout_draft", { keyPath: "id" });
        }

        if (oldVersion < 4) {
          db.createObjectStore("sync_tombstones", { keyPath: "key" });
          db.createObjectStore("sync_meta", { keyPath: "key" });

          // Backfill updatedAt on every pre-existing record (it wasn't tracked
          // before this version) so the first sync pass — which uploads
          // everything with updatedAt newer than watermark 0 — picks up all
          // of this device's existing data instead of treating it as absent.
          const now = Date.now();

          const templateStore = transaction.objectStore("templates");
          for (let cursor = await templateStore.openCursor(); cursor; cursor = await cursor.continue()) {
            if (!cursor.value.updatedAt) await cursor.update({ ...cursor.value, updatedAt: now });
          }

          const libraryStore = transaction.objectStore("exercise_library");
          for (let cursor = await libraryStore.openCursor(); cursor; cursor = await cursor.continue()) {
            if (!cursor.value.updatedAt) await cursor.update({ ...cursor.value, updatedAt: now });
          }

          const sessionStore = transaction.objectStore("workout_sessions");
          for (let cursor = await sessionStore.openCursor(); cursor; cursor = await cursor.continue()) {
            if (!cursor.value.updatedAt) await cursor.update({ ...cursor.value, updatedAt: now });
          }

          const draftStore = transaction.objectStore("active_workout_draft");
          for (let cursor = await draftStore.openCursor(); cursor; cursor = await cursor.continue()) {
            if (!cursor.value.updatedAt) await cursor.update({ ...cursor.value, updatedAt: now });
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

async function tombstone(store: SyncTombstone["store"], id: string): Promise<void> {
  const db = await getDB();
  await db.put("sync_tombstones", { key: `${store}:${id}`, store, id, deletedAt: Date.now() });
}

export async function lastSetsFor(exerciseName: string): Promise<{ r: number; w: number }[] | null> {
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

export async function saveTemplate(template: Omit<Template, "updatedAt">): Promise<void> {
  const db = await getDB();
  await db.put("templates", { ...template, updatedAt: Date.now() });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("templates", id);
  await tombstone("templates", id);
  const draft = await db.get("active_workout_draft", "current");
  if (draft && draft.templateId === id) {
    await db.delete("active_workout_draft", "current");
    await tombstone("active_workout_draft", "current");
  }
}

export async function getExerciseLibrary(): Promise<LibraryExercise[]> {
  const db = await getDB();
  return db.getAll("exercise_library");
}

export async function getLibraryExercise(id: string): Promise<LibraryExercise | undefined> {
  const db = await getDB();
  return db.get("exercise_library", id);
}

export async function saveLibraryExercise(exercise: Omit<LibraryExercise, "updatedAt">): Promise<void> {
  const db = await getDB();
  await db.put("exercise_library", { ...exercise, updatedAt: Date.now() });
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
  await tombstone("exercise_library", id);
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

export async function getActiveWorkoutDraft(): Promise<ActiveWorkoutDraft | undefined> {
  const db = await getDB();
  return db.get("active_workout_draft", "current");
}

export async function saveActiveWorkoutDraft(draft: Omit<ActiveWorkoutDraft, "updatedAt">): Promise<void> {
  const db = await getDB();
  await db.put("active_workout_draft", { ...draft, updatedAt: Date.now() });
}

export async function clearActiveWorkoutDraft(): Promise<void> {
  const db = await getDB();
  await db.delete("active_workout_draft", "current");
  await tombstone("active_workout_draft", "current");
}

export async function saveWorkoutSession(session: Omit<WorkoutSession, "updatedAt">): Promise<void> {
  const db = await getDB();
  await db.put("workout_sessions", { ...session, updatedAt: Date.now() });
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

export interface ExerciseHistoryPoint {
  t: number;
  peak: number;
  vol: number;
}

export function groupSessionsByExercise(
  sessions: WorkoutSession[]
): Record<string, ExerciseHistoryPoint[]> {
  const grouped: Record<string, ExerciseHistoryPoint[]> = {};
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) continue;
      const peak = Math.max(...ex.sets.map((s) => s.weight));
      const vol = ex.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      if (!grouped[ex.name]) grouped[ex.name] = [];
      grouped[ex.name].push({ t: session.startedAt, peak, vol });
    }
  }
  for (const points of Object.values(grouped)) {
    points.sort((a, b) => a.t - b.t);
  }
  return grouped;
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

// ── Sync support ──────────────────────────────────────────────────────────
// Everything below is consumed only by src/lib/sync.ts. Unlike the public
// save*/delete* functions above (which always stamp updatedAt: Date.now()
// and write a tombstone), these are raw passthroughs: pulling a remote
// record must preserve its exact remote updatedAt rather than re-stamping
// it locally, and applying a remote-originated delete must not re-tombstone
// (that record is already deleted server-side; tombstoning it again would
// just push a redundant, if harmless, echo back next sync).

export async function getSyncedAt(): Promise<number> {
  const db = await getDB();
  const rec = await db.get("sync_meta", "lastSyncedAt");
  return rec?.value ?? 0;
}

export async function setSyncedAt(value: number): Promise<void> {
  const db = await getDB();
  await db.put("sync_meta", { key: "lastSyncedAt", value });
}

export async function getSyncTombstones(): Promise<SyncTombstone[]> {
  const db = await getDB();
  return db.getAll("sync_tombstones");
}

export async function clearSyncTombstone(key: string): Promise<void> {
  const db = await getDB();
  await db.delete("sync_tombstones", key);
}

export async function getTemplatesUpdatedSince(since: number): Promise<Template[]> {
  const db = await getDB();
  const all = await db.getAll("templates");
  return all.filter((t) => t.updatedAt > since);
}

export async function getLibraryUpdatedSince(since: number): Promise<LibraryExercise[]> {
  const db = await getDB();
  const all = await db.getAll("exercise_library");
  return all.filter((e) => e.updatedAt > since);
}

export async function getSessionsUpdatedSince(since: number): Promise<WorkoutSession[]> {
  const db = await getDB();
  const all = await db.getAll("workout_sessions");
  return all.filter((s) => s.updatedAt > since);
}

export async function getDraftUpdatedSince(since: number): Promise<ActiveWorkoutDraft | null> {
  const db = await getDB();
  const draft = await db.get("active_workout_draft", "current");
  return draft && draft.updatedAt > since ? draft : null;
}

export async function putTemplateRaw(template: Template): Promise<void> {
  const db = await getDB();
  await db.put("templates", template);
}

export async function putLibraryExerciseRaw(exercise: LibraryExercise): Promise<void> {
  const db = await getDB();
  await db.put("exercise_library", exercise);
}

export async function putWorkoutSessionRaw(session: WorkoutSession): Promise<void> {
  const db = await getDB();
  await db.put("workout_sessions", session);
}

export async function putActiveWorkoutDraftRaw(draft: ActiveWorkoutDraft): Promise<void> {
  const db = await getDB();
  await db.put("active_workout_draft", draft);
}

export async function deleteTemplateRaw(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("templates", id);
}

export async function deleteLibraryExerciseRaw(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("exercise_library", id);
}

export async function deleteActiveWorkoutDraftRaw(): Promise<void> {
  const db = await getDB();
  await db.delete("active_workout_draft", "current");
}

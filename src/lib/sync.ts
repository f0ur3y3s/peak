import { supabase } from "@/lib/supabase";
import {
  getSyncedAt,
  setSyncedAt,
  getPushedAt,
  setPushedAt,
  getSyncTombstones,
  clearSyncTombstone,
  getTemplatesUpdatedSince,
  getLibraryUpdatedSince,
  getSessionsUpdatedSince,
  getDraftUpdatedSince,
  putTemplateRaw,
  putLibraryExerciseRaw,
  putWorkoutSessionRaw,
  putActiveWorkoutDraftRaw,
  deleteTemplateRaw,
  deleteLibraryExerciseRaw,
  deleteActiveWorkoutDraftRaw,
  deleteWorkoutSessionRaw,
  getTemplate,
  getLibraryExercise,
  getWorkoutSession,
  getActiveWorkoutDraft,
  clearActiveWorkoutDraft,
  type Template,
  type LibraryExercise,
  type WorkoutSession,
  type ActiveWorkoutDraft,
} from "@/lib/db";

type SyncResult = { ok: true } | { ok: false; error: string };

/**
 * A pub-sub store of the last pass's outcome, mirroring lib/swUpdate.ts, so a
 * status line can react without threading state through every screen.
 *
 * Nothing in the UI used to say whether sync was working. A device that had
 * been failing to reach the server for a week looked exactly like one that
 * was up to date.
 */
export type SyncStatus = "idle" | "syncing" | "error";

let status: SyncStatus = "idle";
let lastError: string | null = null;
const statusListeners = new Set<() => void>();
// useSyncExternalStore compares snapshots by identity, so this has to be a
// stable object that is only replaced when something actually changes —
// returning a fresh literal each call would re-render forever.
let snapshot: { status: SyncStatus; error: string | null } = { status, error: lastError };

function publishStatus(next: SyncStatus, error: string | null): void {
  if (status === next && lastError === error) return;
  status = next;
  lastError = error;
  snapshot = { status, error: lastError };
  statusListeners.forEach((l) => l());
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getSyncStatus(): { status: SyncStatus; error: string | null } {
  return snapshot;
}

// Guards against overlapping sync passes (periodic timer + manual button +
// on-sign-in trigger can all fire close together) — two syncs racing would
// each capture their own "since" watermark and could interleave push/pull
// calls against the same rows.
let syncInFlight: Promise<SyncResult> | null = null;

export function syncNow(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(): Promise<SyncResult> {
  publishStatus("syncing", null);
  try {
    // Inside the try: supabase-js acquires a navigator.locks lock here and
    // rejects with NavigatorLockAcquireTimeoutError when another tab or a
    // backgrounded PWA instance holds it. Outside, that rejection escaped
    // syncNow() entirely — Profile's "Sync now" stayed disabled on
    // "Syncing…" with no error shown, and App's periodic call produced an
    // unhandled rejection.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      publishStatus("idle", null);
      return { ok: false, error: "Not signed in." };
    }
    const userId = session.user.id;

    // Two watermarks, because two different clocks are involved.
    //
    // The PUSH watermark is local time compared against local records'
    // updatedAt — same clock both sides. Captured before the push runs, not
    // after, so anything written during the pass is caught next time rather
    // than falling below every future watermark.
    //
    // The PULL watermark is remote time: the newest updated_at this device
    // has actually seen, which was minted by whichever device wrote it.
    // Comparing it against the local clock (as a single watermark did) meant
    // a laptop ten minutes fast advanced past a phone's genuinely newer
    // workout, which then never arrived on that laptop — not late, never.
    const pushSince = await getPushedAt();
    const pullSince = await getSyncedAt();
    const sinceIso = new Date(pullSince).toISOString();

    // The newest remote timestamp this pass actually saw, which becomes the
    // next pull watermark. Starts at the current one so an empty pull leaves
    // it untouched rather than resetting it.
    let newestSeen = pullSince;
    const observe = (iso: string) => {
      const t = new Date(iso).getTime();
      if (Number.isFinite(t) && t > newestSeen) newestSeen = t;
    };

    // The draft is reconciled BEFORE the push, unlike every other store. It
    // is the one record the engine unions rather than overwrites, and its
    // upsert is unconditional — pushing first sent this device's copy straight
    // over the other device's sets, so by the time the pull ran there was
    // nothing left to union. Merging first means the push carries the union.
    await pullDraft(userId, sinceIso, observe);

    const pushStartedAt = Date.now();
    await pushChanges(userId, pushSince);
    await pushTombstones(userId);
    await pullChanges(userId, sinceIso, observe);

    await setPushedAt(pushStartedAt);
    // Only ever forward, and only to something the server actually returned.
    if (newestSeen > pullSince) await setSyncedAt(newestSeen);
    publishStatus("idle", null);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Sync failed — try again.";
    publishStatus("error", error);
    return { ok: false, error };
  }
}

async function pushChanges(userId: string, since: number): Promise<void> {
  const templates = await getTemplatesUpdatedSince(since);
  if (templates.length > 0) {
    const { error } = await supabase.from("templates").upsert(
      templates.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        exercises: t.exercises,
        notes: t.notes ?? null,
        position: t.order,
        updated_at: new Date(t.updatedAt).toISOString(),
      }))
    );
    if (error) throw error;
  }

  const library = await getLibraryUpdatedSince(since);
  if (library.length > 0) {
    const { error } = await supabase.from("exercise_library").upsert(
      library.map((e) => ({
        id: e.id,
        user_id: userId,
        name: e.name,
        muscle: e.muscle,
        notes: e.notes ?? null,
        updated_at: new Date(e.updatedAt).toISOString(),
      }))
    );
    if (error) throw error;
  }

  const sessions = await getSessionsUpdatedSince(since);
  if (sessions.length > 0) {
    const { error } = await supabase.from("workout_sessions").upsert(
      sessions.map((s) => ({
        id: s.id,
        user_id: userId,
        template_id: s.templateId ?? null,
        template_name: s.templateName,
        started_at: s.startedAt,
        finished_at: s.finishedAt,
        exercises: s.exercises,
        prs: s.prs,
        updated_at: new Date(s.updatedAt).toISOString(),
      }))
    );
    if (error) throw error;
  }

  const draft = await getDraftUpdatedSince(since);
  if (draft) {
    const { error } = await supabase.from("active_workout_draft").upsert({
      user_id: userId,
      template_id: draft.templateId,
      template_name: draft.templateName,
      started_at: draft.startedAt,
      exercises: draft.exercises,
      updated_at: new Date(draft.updatedAt).toISOString(),
      deleted_at: null,
    });
    if (error) throw error;
  }
}

/** PostgREST's two ways of saying the column is not there: 42703 from
 *  Postgres itself, PGRST204 from the schema cache. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204";
}

async function pushTombstones(userId: string): Promise<void> {
  const tombstones = await getSyncTombstones();
  for (const t of tombstones) {
    const deletedAtIso = new Date(t.deletedAt).toISOString();
    // Last-write-wins applies to deletes too: only apply this delete if the
    // remote row isn't already newer than the delete itself (an ".lt" guard
    // on updated_at). Without this, an old local delete could silently
    // overwrite a genuinely newer edit made on another device — the delete
    // would win purely because it happened to sync last, not because it
    // was last. If the remote row is newer, this delete lost the race and
    // is simply dropped (its tombstone is still cleared below — there is
    // no reason to keep re-asserting a delete that lost).
    if (t.store === "templates") {
      const { error } = await supabase
        .from("templates")
        .update({ deleted_at: deletedAtIso, updated_at: deletedAtIso })
        .eq("id", t.id)
        .eq("user_id", userId)
        .lt("updated_at", deletedAtIso);
      if (error) throw error;
    } else if (t.store === "workout_sessions") {
      const { error } = await supabase
        .from("workout_sessions")
        .update({ deleted_at: deletedAtIso, updated_at: deletedAtIso })
        .eq("id", t.id)
        .eq("user_id", userId)
        .lt("updated_at", deletedAtIso);
      // workout_sessions gained deleted_at later than the other tables (see
      // migration 009), so a project that has not run it yet rejects this
      // write. Leaving the tombstone in place rather than throwing means the
      // local delete still stands, the rest of the pass still runs, and the
      // deletion propagates by itself once the migration lands — instead of
      // one un-migrated project breaking sync outright.
      if (error) {
        if (isMissingColumn(error)) continue;
        throw error;
      }
    } else if (t.store === "exercise_library") {
      const { error } = await supabase
        .from("exercise_library")
        .update({ deleted_at: deletedAtIso, updated_at: deletedAtIso })
        .eq("id", t.id)
        .eq("user_id", userId)
        .lt("updated_at", deletedAtIso);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("active_workout_draft")
        .update({ deleted_at: deletedAtIso, updated_at: deletedAtIso })
        .eq("user_id", userId)
        .lt("updated_at", deletedAtIso);
      if (error) throw error;
    }
    await clearSyncTombstone(t.key);
  }
}

/**
 * Reads every row a table has for this user since `sinceIso`, a page at a
 * time, oldest first.
 *
 * The previous single `.select("*")` was silently capped by the project's
 * "Max rows" API setting (commonly 1000) while the watermark advanced past
 * the rows that were cut — putting them permanently outside every future
 * window. Most acute on workout_sessions during a new device's first sync,
 * which is exactly when there is the most to lose. Ordering by updated_at
 * makes the paging deterministic even as rows change underneath it.
 */
const PAGE_SIZE = 500;

async function pullPage<T>(table: string, userId: string, sinceIso: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .gt("updated_at", sinceIso)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function pullChanges(
  userId: string,
  sinceIso: string,
  observe: (iso: string) => void
): Promise<void> {
  const remoteTemplates = await pullPage<any>("templates", userId, sinceIso);
  for (const row of remoteTemplates) {
    const updatedAt = new Date(row.updated_at).getTime();
    observe(row.updated_at);
    const existing = await getTemplate(row.id);
    // Guards against a stale pull clobbering a local edit made after this
    // sync pass's own push already ran (push happens before pull, so a
    // record we just pushed comes right back on this same pull — safe to
    // skip re-applying it, and safe against any edit that landed in the
    // brief window between push and pull).
    if (existing && existing.updatedAt >= updatedAt) continue;
    if (row.deleted_at) {
      await deleteTemplateRaw(row.id);
      // The local delete path cascades to the draft (db.ts deleteTemplate);
      // this raw one deliberately does not, which left a draft pointing at a
      // template that no longer exists. App then routed straight into an
      // active workout with no exercises and no way back to its logged sets,
      // and Finish built a session from nothing.
      //
      // Tombstoned rather than dropped raw: the remote draft row survives the
      // template's deletion, so a raw local delete was undone by the very next
      // pull, which restored the orphan from the server.
      const draft = await getActiveWorkoutDraft();
      if (draft && draft.templateId === row.id) await clearActiveWorkoutDraft();
      continue;
    }
    const local: Template = {
      id: row.id,
      name: row.name,
      exercises: row.exercises,
      notes: row.notes ?? undefined,
      order: row.position ?? 0,
      updatedAt,
    };
    await putTemplateRaw(local);
  }

  const remoteLibrary = await pullPage<any>("exercise_library", userId, sinceIso);
  for (const row of remoteLibrary) {
    const updatedAt = new Date(row.updated_at).getTime();
    observe(row.updated_at);
    const existing = await getLibraryExercise(row.id);
    if (existing && existing.updatedAt >= updatedAt) continue;
    if (row.deleted_at) {
      await deleteLibraryExerciseRaw(row.id);
      continue;
    }
    const local: LibraryExercise = {
      id: row.id,
      name: row.name,
      muscle: row.muscle,
      notes: row.notes ?? undefined,
      updatedAt,
    };
    await putLibraryExerciseRaw(local);
  }

  const remoteSessions = await pullPage<any>("workout_sessions", userId, sinceIso);
  for (const row of remoteSessions) {
    const updatedAt = new Date(row.updated_at).getTime();
    observe(row.updated_at);
    const existing = await getWorkoutSession(row.id);
    if (existing && existing.updatedAt >= updatedAt) continue;
    if (row.deleted_at) {
      await deleteWorkoutSessionRaw(row.id);
      continue;
    }
    const local: WorkoutSession = {
      id: row.id,
      templateId: row.template_id ?? undefined,
      templateName: row.template_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      exercises: row.exercises,
      prs: row.prs,
      updatedAt,
    };
    await putWorkoutSessionRaw(local);
  }
}

async function pullDraft(
  userId: string,
  sinceIso: string,
  observe: (iso: string) => void
): Promise<void> {
  const { data: remoteDraft, error: draftError } = await supabase
    .from("active_workout_draft")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", sinceIso)
    .maybeSingle();
  if (draftError) throw draftError;
  if (!remoteDraft) return;

  observe(remoteDraft.updated_at);
  const remoteUpdatedAt = new Date(remoteDraft.updated_at).getTime();
  const existing = await getActiveWorkoutDraft();

  if (remoteDraft.deleted_at) {
    // A delete still wins by recency: finishing or discarding a workout on
    // one device must clear it everywhere.
    if (!existing || existing.updatedAt < remoteUpdatedAt) await deleteActiveWorkoutDraftRaw();
    return;
  }

  const remote: ActiveWorkoutDraft = {
    id: "current",
    templateId: remoteDraft.template_id,
    templateName: remoteDraft.template_name,
    startedAt: remoteDraft.started_at,
    exercises: remoteDraft.exercises,
    updatedAt: remoteUpdatedAt,
  };

  if (!existing) {
    await putActiveWorkoutDraftRaw(remote);
    return;
  }

  if (existing.templateId !== remote.templateId) {
    // Two different workouts in progress on two devices. Their sets belong to
    // different sessions, so merging them would be wrong; the newer record
    // wins whole, as before.
    if (existing.updatedAt < remoteUpdatedAt) await putActiveWorkoutDraftRaw(remote);
    return;
  }

  const merged = mergeDrafts(existing, remote);
  if (merged) await putActiveWorkoutDraftRaw(merged);
}

/**
 * Unions two copies of the same in-progress workout by logged-set id.
 *
 * The draft used to be plain last-write-wins over the whole record, and its
 * `exercises` array holds every set of the workout — so a phone that logged
 * four sets in the gym and a tablet that logged three more overwrote each
 * other: whichever synced second won, and the other three sets were gone with
 * no conflict shown anywhere. Logged sets already carry stable ids, so the
 * union is exact — a set is the same set on both devices or it is not.
 *
 * Returns null when the merge changes nothing, so an unchanged draft is not
 * rewritten (and so does not re-push on the next pass).
 *
 * Exported for its unit tests; nothing outside the sync engine calls it.
 */
export function mergeDrafts(
  local: ActiveWorkoutDraft,
  remote: ActiveWorkoutDraft
): ActiveWorkoutDraft | null {
  const remoteNewer = remote.updatedAt > local.updatedAt;
  // Exercise order is the session's own (see ActiveWorkout's "Do later"), so
  // take it from the newer record and append anything only the other has.
  const primary = remoteNewer ? remote : local;
  const secondary = remoteNewer ? local : remote;
  const secondaryById = new Map(secondary.exercises.map((e) => [e.exerciseId, e]));

  let changed = false;
  const exercises = primary.exercises.map((ex) => {
    const other = secondaryById.get(ex.exerciseId);
    secondaryById.delete(ex.exerciseId);
    if (!other) return ex;

    const seen = new Set(ex.logged.map((s) => s.id));
    const extra = other.logged.filter((s) => !seen.has(s.id));
    if (extra.length === 0) return ex;
    changed = true;
    return { ...ex, logged: [...ex.logged, ...extra] };
  });

  for (const leftover of secondaryById.values()) {
    changed = true;
    exercises.push(leftover);
  }

  if (!changed) {
    // Nothing to union. Still adopt the remote record if it is simply newer,
    // so later edits to rest times and the like are not dropped.
    return remoteNewer ? remote : null;
  }

  return {
    ...primary,
    exercises,
    // Stamped now so the union itself propagates: the device that merged is
    // the only one holding the complete picture until it pushes.
    updatedAt: Date.now(),
  };
}

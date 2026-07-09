import { supabase } from "@/lib/supabase";
import {
  getSyncedAt,
  setSyncedAt,
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
  getTemplate,
  getLibraryExercise,
  getWorkoutSession,
  getActiveWorkoutDraft,
  type Template,
  type LibraryExercise,
  type WorkoutSession,
  type ActiveWorkoutDraft,
} from "@/lib/db";

type SyncResult = { ok: true } | { ok: false; error: string };

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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  try {
    const since = await getSyncedAt();
    // Captured before push/pull run, not after — advancing the watermark to
    // a timestamp taken after the pull query executes would silently and
    // permanently miss anything written remotely in that window (it would
    // fall below every future "since" too, not just this pass's).
    const syncStartedAt = Date.now();

    await pushChanges(userId, since);
    await pushTombstones(userId);
    await pullChanges(userId, since);

    await setSyncedAt(syncStartedAt);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed — try again." };
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

async function pullChanges(userId: string, since: number): Promise<void> {
  const sinceIso = new Date(since).toISOString();

  const { data: remoteTemplates, error: templatesError } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", sinceIso);
  if (templatesError) throw templatesError;
  for (const row of remoteTemplates ?? []) {
    const updatedAt = new Date(row.updated_at).getTime();
    const existing = await getTemplate(row.id);
    // Guards against a stale pull clobbering a local edit made after this
    // sync pass's own push already ran (push happens before pull, so a
    // record we just pushed comes right back on this same pull — safe to
    // skip re-applying it, and safe against any edit that landed in the
    // brief window between push and pull).
    if (existing && existing.updatedAt >= updatedAt) continue;
    if (row.deleted_at) {
      await deleteTemplateRaw(row.id);
      continue;
    }
    const local: Template = {
      id: row.id,
      name: row.name,
      exercises: row.exercises,
      order: row.position ?? 0,
      updatedAt,
    };
    await putTemplateRaw(local);
  }

  const { data: remoteLibrary, error: libraryError } = await supabase
    .from("exercise_library")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", sinceIso);
  if (libraryError) throw libraryError;
  for (const row of remoteLibrary ?? []) {
    const updatedAt = new Date(row.updated_at).getTime();
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
      updatedAt,
    };
    await putLibraryExerciseRaw(local);
  }

  const { data: remoteSessions, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", sinceIso);
  if (sessionsError) throw sessionsError;
  for (const row of remoteSessions ?? []) {
    const updatedAt = new Date(row.updated_at).getTime();
    const existing = await getWorkoutSession(row.id);
    if (existing && existing.updatedAt >= updatedAt) continue;
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

  const { data: remoteDraft, error: draftError } = await supabase
    .from("active_workout_draft")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", sinceIso)
    .maybeSingle();
  if (draftError) throw draftError;
  if (remoteDraft) {
    const remoteUpdatedAt = new Date(remoteDraft.updated_at).getTime();
    const existing = await getActiveWorkoutDraft();
    if (existing && existing.updatedAt >= remoteUpdatedAt) return;
    if (remoteDraft.deleted_at) {
      await deleteActiveWorkoutDraftRaw();
    } else {
      const local: ActiveWorkoutDraft = {
        id: "current",
        templateId: remoteDraft.template_id,
        templateName: remoteDraft.template_name,
        startedAt: remoteDraft.started_at,
        exercises: remoteDraft.exercises,
        updatedAt: remoteUpdatedAt,
      };
      await putActiveWorkoutDraftRaw(local);
    }
  }
}

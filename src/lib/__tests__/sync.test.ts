// The sync engine, against fake-indexeddb for the local half and the
// in-memory fake client for the remote half (see ./fakeSupabase). Every case
// below is a way a user's data could actually go missing, and most of them
// have gone missing at some point.
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeState, fakeSupabase, remoteRow, resetFakeSupabase } from "./fakeSupabase";

vi.mock("@/lib/supabase", () => ({ supabase: fakeSupabase }));

import { syncNow, mergeDrafts } from "@/lib/sync";
import {
  clearLocalData,
  deleteTemplate,
  getActiveWorkoutDraft,
  getPushedAt,
  getSyncedAt,
  getTemplate,
  getTemplates,
  getWorkoutSession,
  getWorkoutSessions,
  putActiveWorkoutDraftRaw,
  putTemplateRaw,
  saveTemplate,
  type ActiveWorkoutDraft,
  type Template,
} from "@/lib/db";

const USER = "user-1";

function iso(t: number): string {
  return new Date(t).toISOString();
}

function template(id: string, over: Partial<Template> = {}): Template {
  return {
    id,
    name: id,
    exercises: [],
    order: 0,
    updatedAt: Date.now(),
    ...over,
  };
}

function remoteTemplate(id: string, updatedAt: number, over: Record<string, unknown> = {}): void {
  remoteRow("templates", {
    id,
    user_id: USER,
    name: id,
    exercises: [],
    notes: null,
    position: 0,
    updated_at: iso(updatedAt),
    ...over,
  });
}

function remoteSession(id: string, updatedAt: number): void {
  remoteRow("workout_sessions", {
    id,
    user_id: USER,
    template_id: null,
    template_name: "Push A",
    started_at: updatedAt,
    finished_at: updatedAt + 1000,
    exercises: [],
    prs: [],
    updated_at: iso(updatedAt),
  });
}

function draft(over: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    id: "current",
    templateId: "t1",
    templateName: "Push A",
    startedAt: 1_000,
    exercises: [{ exerciseId: "e1", logged: [] }],
    updatedAt: 1_000,
    ...over,
  };
}

beforeEach(async () => {
  resetFakeSupabase();
  fakeState.session = { user: { id: USER } };
  await clearLocalData();
});

afterEach(async () => {
  await clearLocalData();
});

describe("syncNow", () => {
  it("reports not signed in rather than throwing", async () => {
    fakeState.session = null;
    expect(await syncNow()).toEqual({ ok: false, error: "Not signed in." });
  });

  it("turns a rejected getSession into an error result", async () => {
    // supabase-js rejects here when another tab holds its navigator.locks
    // lock; that rejection used to escape syncNow() entirely and leave the
    // Sync button stuck on "Syncing…".
    fakeState.sessionError = new Error("NavigatorLockAcquireTimeoutError");
    const result = await syncNow();
    expect(result).toEqual({ ok: false, error: "NavigatorLockAcquireTimeoutError" });
  });

  it("uploads local records and downloads remote ones in one pass", async () => {
    await saveTemplate({ id: "local-1", name: "Pull A", exercises: [], order: 0 });
    remoteTemplate("remote-1", Date.now() - 5_000);

    expect(await syncNow()).toEqual({ ok: true });

    expect(fakeState.tables.templates.map((r) => r.id).sort()).toEqual(["local-1", "remote-1"]);
    expect((await getTemplates()).map((t) => t.id).sort()).toEqual(["local-1", "remote-1"]);
  });

  it("keeps a pulled record's remote updatedAt rather than re-stamping it", async () => {
    const remoteAt = Date.now() - 90_000;
    remoteTemplate("remote-1", remoteAt);

    await syncNow();

    expect((await getTemplate("remote-1"))?.updatedAt).toBe(remoteAt);
  });

  it("does not let a stale pull overwrite a newer local edit", async () => {
    const now = Date.now();
    await putTemplateRaw(template("t1", { name: "Local newer", updatedAt: now }));
    remoteTemplate("t1", now - 60_000, { name: "Remote older" });

    await syncNow();

    expect((await getTemplate("t1"))?.name).toBe("Local newer");
  });
});

describe("pull watermark", () => {
  it("advances to the newest remote timestamp, not to the local clock", async () => {
    const remoteAt = Date.now() - 120_000;
    remoteTemplate("remote-1", remoteAt);

    await syncNow();

    expect(await getSyncedAt()).toBe(remoteAt);
  });

  it("still delivers a remote row written while this device's clock ran ahead", async () => {
    // The regression this split exists for: one watermark held local time and
    // was compared against remote timestamps, so a device whose clock was
    // minutes fast advanced straight past another device's genuinely new rows,
    // which then never arrived — not late, never.
    const otherDeviceClock = Date.now() - 300_000;
    remoteTemplate("first", otherDeviceClock);
    await syncNow();
    expect(await getTemplate("first")).toBeDefined();

    remoteTemplate("second", otherDeviceClock + 1_000);
    await syncNow();

    expect(await getTemplate("second")).toBeDefined();
    expect(await getSyncedAt()).toBe(otherDeviceClock + 1_000);
    expect(await getSyncedAt()).toBeLessThan(Date.now());
  });

  it("leaves the watermark untouched when a pass returns nothing", async () => {
    const remoteAt = Date.now() - 10_000;
    remoteTemplate("remote-1", remoteAt);
    await syncNow();
    await syncNow();

    expect(await getSyncedAt()).toBe(remoteAt);
  });
});

describe("push watermark", () => {
  it("picks up a record written while the previous pass was still in flight", async () => {
    // Captured before the push rather than after it: a record saved during the
    // pass must fall inside the next window, not below every future one.
    fakeState.beforeSelect = async (table) => {
      if (table !== "workout_sessions") return;
      fakeState.beforeSelect = null;
      await new Promise((r) => setTimeout(r, 2));
      await putTemplateRaw(template("written-mid-sync", { updatedAt: Date.now() }));
    };

    await syncNow();
    expect(fakeState.tables.templates.map((r) => r.id)).not.toContain("written-mid-sync");

    await syncNow();
    expect(fakeState.tables.templates.map((r) => r.id)).toContain("written-mid-sync");
  });

  it("does not re-upload records that have not changed", async () => {
    await saveTemplate({ id: "t1", name: "Push A", exercises: [], order: 0 });
    await syncNow();
    const uploadedAt = fakeState.tables.templates[0].updated_at;

    await syncNow();

    expect(fakeState.tables.templates).toHaveLength(1);
    expect(fakeState.tables.templates[0].updated_at).toBe(uploadedAt);
  });

  it("starts from the pull watermark on a device that predates it", async () => {
    // Existing installs have lastSyncedAt but no lastPushedAt. Starting them
    // at 0 would re-push every local record on the first pass after the
    // update, upserting stale copies over rows another device has since
    // edited.
    const remoteAt = Date.now() - 30_000;
    remoteTemplate("remote-1", remoteAt);
    await syncNow();

    expect(await getPushedAt()).toBeGreaterThan(0);
    expect(await getPushedAt()).toBeLessThanOrEqual(Date.now());
  });
});

describe("pull pagination", () => {
  it("reads past the server's row cap instead of losing the remainder", async () => {
    // A single unpaged select is silently truncated by the project's Max rows
    // setting while the watermark advances past the rows that were cut,
    // putting them outside every future window. Worst on a new device's first
    // sync, which is when there is the most to lose.
    const base = Date.now() - 2_000_000;
    for (let i = 0; i < 1_201; i++) remoteSession(`s${i}`, base + i);

    await syncNow();

    expect(await getWorkoutSessions()).toHaveLength(1_201);
    expect(await getWorkoutSession("s1200")).toBeDefined();
    expect(await getSyncedAt()).toBe(base + 1_200);

    const pages = fakeState.selectCalls.filter((c) => c.table === "workout_sessions");
    expect(pages.map((p) => p.from)).toEqual([0, 500, 1000]);
  });
});

describe("tombstones", () => {
  it("soft-deletes the remote row", async () => {
    await saveTemplate({ id: "t1", name: "Push A", exercises: [], order: 0 });
    await syncNow();
    await deleteTemplate("t1");

    await syncNow();

    expect(fakeState.tables.templates[0].deleted_at).toBeTruthy();
    expect(await getTemplate("t1")).toBeUndefined();
  });

  it("drops a delete that lost the race to a newer remote edit", async () => {
    await saveTemplate({ id: "t1", name: "Push A", exercises: [], order: 0 });
    await syncNow();
    await deleteTemplate("t1");
    // Another device renamed it after this delete was recorded.
    fakeState.tables.templates[0].updated_at = iso(Date.now() + 60_000);
    fakeState.tables.templates[0].name = "Renamed elsewhere";

    await syncNow();

    expect(fakeState.tables.templates[0].deleted_at).toBeNull();
    expect((await getTemplate("t1"))?.name).toBe("Renamed elsewhere");
  });

  it("clears the local draft when its template is deleted remotely", async () => {
    // deleteTemplateRaw does not cascade the way the local delete does, which
    // left a draft pointing at a template that no longer existed: the app
    // routed straight into a workout with no exercises and Finish built a
    // session out of nothing.
    await putActiveWorkoutDraftRaw(draft({ templateId: "t1" }));
    remoteTemplate("t1", Date.now(), { deleted_at: iso(Date.now()) });

    await syncNow();
    expect(await getActiveWorkoutDraft()).toBeUndefined();

    // And the clear propagates: dropping the local row raw left the remote
    // draft standing, so the very next pull restored the orphan.
    await syncNow();
    expect(fakeState.tables.active_workout_draft[0]?.deleted_at).toBeTruthy();
  });
});

describe("draft merge over sync", () => {
  it("keeps sets logged on both devices during the same workout", async () => {
    await putActiveWorkoutDraftRaw(
      draft({
        exercises: [{ exerciseId: "e1", logged: [{ id: "a", reps: 5, weight: 100 }] }],
        updatedAt: Date.now() - 10_000,
      })
    );
    remoteRow("active_workout_draft", {
      user_id: USER,
      template_id: "t1",
      template_name: "Push A",
      started_at: 1_000,
      exercises: [{ exerciseId: "e1", logged: [{ id: "b", reps: 5, weight: 102.5 }] }],
      updated_at: iso(Date.now() - 5_000),
    });

    await syncNow();

    const merged = await getActiveWorkoutDraft();
    expect(merged?.exercises[0].logged.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeDrafts", () => {
  const local = draft({
    exercises: [{ exerciseId: "e1", logged: [{ id: "a", reps: 5, weight: 100 }] }],
    updatedAt: 2_000,
  });

  it("unions logged sets by id", () => {
    const remote = draft({
      exercises: [{ exerciseId: "e1", logged: [{ id: "b", reps: 5, weight: 105 }] }],
      updatedAt: 3_000,
    });

    const merged = mergeDrafts(local, remote);

    expect(merged?.exercises[0].logged.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("does not duplicate a set both devices already have", () => {
    const remote = draft({
      exercises: [
        {
          exerciseId: "e1",
          logged: [
            { id: "a", reps: 5, weight: 100 },
            { id: "b", reps: 5, weight: 105 },
          ],
        },
      ],
      updatedAt: 3_000,
    });

    const merged = mergeDrafts(local, remote);

    expect(merged?.exercises[0].logged.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("takes exercise order from the newer record and appends the rest", () => {
    const remote = draft({
      exercises: [
        { exerciseId: "e2", logged: [] },
        { exerciseId: "e1", logged: [] },
      ],
      updatedAt: 3_000,
    });

    const merged = mergeDrafts(
      draft({
        exercises: [
          { exerciseId: "e1", logged: [] },
          { exerciseId: "e3", logged: [{ id: "c", reps: 8, weight: 20 }] },
        ],
        updatedAt: 2_000,
      }),
      remote
    );

    expect(merged?.exercises.map((e) => e.exerciseId)).toEqual(["e2", "e1", "e3"]);
  });

  it("returns null when the older record has nothing to contribute", () => {
    const remote = draft({
      exercises: [{ exerciseId: "e1", logged: [] }],
      updatedAt: 1_000,
    });

    expect(mergeDrafts(local, remote)).toBeNull();
  });

  it("adopts a newer remote record that only changed rest times", () => {
    const remote = draft({
      exercises: [{ exerciseId: "e1", logged: [{ id: "a", reps: 5, weight: 100 }], restSeconds: 150 }],
      updatedAt: 3_000,
    });

    expect(mergeDrafts(local, remote)).toBe(remote);
  });

  it("re-stamps a real merge so the union itself propagates", () => {
    const remote = draft({
      exercises: [{ exerciseId: "e1", logged: [{ id: "b", reps: 5, weight: 105 }] }],
      updatedAt: 3_000,
    });

    const merged = mergeDrafts(local, remote);

    expect(merged?.updatedAt).toBeGreaterThan(3_000);
  });
});

// Connection-level behaviour of src/lib/db.ts: the two ways the database can
// stop answering that used to present as the app simply hanging, and the
// request that stops the browser evicting it.
import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { getTemplates, requestPersistentStorage } from "@/lib/db";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestPersistentStorage", () => {
  it("does not ask again when the origin is already persisted", async () => {
    const persist = vi.fn();
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(true), persist },
    });

    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("asks when it is not", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(false), persist },
    });

    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it("reports a refusal rather than throwing", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn().mockResolvedValue(false),
      },
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("is a no-op where the API does not exist", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("survives a browser that throws from the API", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        persisted: vi.fn().mockRejectedValue(new Error("SecurityError")),
        persist: vi.fn(),
      },
    });
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe("a database another tab is holding at an older version", () => {
  // Kept last in this file: it leaves the database at v4, held open.
  it("fails with something readable instead of hanging forever", async () => {
    // openDB never settles while an older connection is open, which surfaced
    // as screens stuck on their loading state with nothing to explain it.
    const older = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("peak-db", 4);
      req.onupgradeneeded = () => {
        // The v4 schema, so that when this connection closes the real v5
        // upgrade can finish cleanly rather than aborting on a missing store.
        const db = req.result;
        db.createObjectStore("workout_sessions", { keyPath: "id" }).createIndex(
          "startedAt",
          "startedAt"
        );
        for (const name of ["exercise_library", "templates", "active_workout_draft"]) {
          db.createObjectStore(name, { keyPath: "id" });
        }
        for (const name of ["sync_tombstones", "sync_meta"]) {
          db.createObjectStore(name, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await expect(getTemplates()).rejects.toThrow(/Another tab/i);

    older.close();
  }, 10_000);
});

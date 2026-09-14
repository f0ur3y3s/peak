// Isolated in its own file because the flag it sets is module-level and
// deliberately one-way: once another tab has upgraded the database, this tab's
// code is written against a schema that no longer exists.
import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";
import { getTemplates, saveTemplate } from "@/lib/db";

describe("a database a newer tab upgrades out from under us", () => {
  it("lets go of the connection and says to reload", async () => {
    await saveTemplate({ id: "t1", name: "Push A", exercises: [], order: 0 });
    expect(await getTemplates()).toHaveLength(1);

    // A newer build in another tab opens the database at a higher version.
    // Holding our connection open blocks that upgrade indefinitely — the
    // second tab hangs on a blank screen — so the `blocking` handler closes
    // ours. This open resolving at all is the proof that it did.
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("peak-db", 6);
      req.onupgradeneeded = () => undefined;
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("still blocked by the old connection"));
    });
    expect(newer.version).toBe(6);

    await expect(getTemplates()).rejects.toThrow(/Reload/i);
    newer.close();
  }, 10_000);
});

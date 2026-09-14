// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SyncStatusBar } from "@/components/SyncStatusBar";

const countUnsyncedChanges = vi.fn();
const syncNow = vi.fn();
let listener: (() => void) | null = null;
let snapshot = { status: "idle" as "idle" | "syncing" | "error", error: null as string | null };

vi.mock("@/lib/db", () => ({ countUnsyncedChanges: () => countUnsyncedChanges() }));
vi.mock("@/lib/sync", () => ({
  syncNow: () => syncNow(),
  getSyncStatus: () => snapshot,
  subscribeSyncStatus: (l: () => void) => {
    listener = l;
    return () => {
      listener = null;
    };
  },
}));

function setStatus(status: "idle" | "syncing" | "error", error: string | null = null) {
  snapshot = { status, error };
  listener?.();
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

beforeEach(() => {
  snapshot = { status: "idle", error: null };
  countUnsyncedChanges.mockResolvedValue(0);
  syncNow.mockResolvedValue({ ok: true });
  setOnline(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function show(ui: React.ReactElement) {
  await act(async () => {
    render(ui);
  });
}

describe("SyncStatusBar", () => {
  it("says nothing while online and healthy", async () => {
    countUnsyncedChanges.mockResolvedValue(3);
    await show(<SyncStatusBar signedIn />);

    // Unsynced work on a working device is just the gap between an edit and
    // the next pass — a bar for that would appear after every change.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing at all when signed out", async () => {
    setOnline(false);
    await show(<SyncStatusBar signedIn={false} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(countUnsyncedChanges).not.toHaveBeenCalled();
  });

  it("explains being offline, and that the work is not lost", async () => {
    countUnsyncedChanges.mockResolvedValue(4);
    await show(<SyncStatusBar signedIn />);

    await act(async () => setOnline(false));

    expect(screen.getByRole("status").textContent).toContain("Offline");
    expect(screen.getByRole("status").textContent).toContain("4 changes saved on this device");
  });

  it("reassures even with nothing queued", async () => {
    await show(<SyncStatusBar signedIn />);
    await act(async () => setOnline(false));

    expect(screen.getByRole("status").textContent).toContain("saved on this device");
  });

  it("offers no retry with no connection to retry over", async () => {
    await show(<SyncStatusBar signedIn />);
    await act(async () => setOnline(false));

    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("surfaces a failing sync that is holding work back", async () => {
    countUnsyncedChanges.mockResolvedValue(2);
    await show(<SyncStatusBar signedIn />);

    await act(async () => setStatus("error", "Failed to fetch"));

    expect(screen.getByRole("status").textContent).toContain("Not synced");
    expect(screen.getByRole("status").textContent).toContain("2 changes waiting");
  });

  it("stays quiet about a failure with nothing to lose", async () => {
    // Everything is already on the server; a red bar would be alarm without
    // consequence.
    countUnsyncedChanges.mockResolvedValue(0);
    await show(<SyncStatusBar signedIn />);

    await act(async () => setStatus("error", "Failed to fetch"));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retries on demand", async () => {
    countUnsyncedChanges.mockResolvedValue(1);
    await show(<SyncStatusBar signedIn />);
    await act(async () => setStatus("error", "Failed to fetch"));

    fireEvent.click(screen.getByText("Retry"));

    expect(syncNow).toHaveBeenCalled();
  });

  it("singularises one change", async () => {
    countUnsyncedChanges.mockResolvedValue(1);
    await show(<SyncStatusBar signedIn />);
    await act(async () => setStatus("error", "Failed to fetch"));

    expect(screen.getByRole("status").textContent).toContain("1 change waiting");
  });

  it("goes away once a pass succeeds", async () => {
    countUnsyncedChanges.mockResolvedValue(2);
    await show(<SyncStatusBar signedIn />);
    await act(async () => setStatus("error", "Failed to fetch"));
    expect(screen.getByRole("status")).toBeDefined();

    countUnsyncedChanges.mockResolvedValue(0);
    await act(async () => setStatus("idle", null));

    expect(screen.queryByRole("status")).toBeNull();
  });
});

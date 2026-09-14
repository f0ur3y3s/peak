// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getUser = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, getUser, onAuthStateChange } },
}));

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/abc",
  getKey: (name: string) => new Uint8Array(name === "auth" ? 16 : 65).fill(7).buffer,
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const subscribe = vi.fn().mockResolvedValue(SUBSCRIPTION);
const getSubscription = vi.fn().mockResolvedValue(null);

/** Loads the module fresh, since it captures env and the session at import. */
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const mod = await import("@/lib/restPush");
  // The module reads the session asynchronously on import; let that settle.
  await Promise.resolve();
  await Promise.resolve();
  return mod;
}

beforeEach(() => {
  window.localStorage.clear();
  getSession.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue(SUBSCRIPTION);
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", Object.assign(function Notification() {}, { permission: "granted" }));
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "sub-row-1" }] })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("isRestPushConfigured", () => {
  it("is on when a VAPID key and a push-capable browser are both present", async () => {
    const { isRestPushConfigured } = await load();
    expect(isRestPushConfigured()).toBe(true);
  });

  it("is off with no VAPID key, so the whole path stays inert", async () => {
    // The feature has to be deployable in stages: no key configured means the
    // app behaves exactly as it did before any of this existed.
    const { isRestPushConfigured } = await load({ VITE_VAPID_PUBLIC_KEY: "" });
    expect(isRestPushConfigured()).toBe(false);
  });

  it("is off in a browser without push", async () => {
    const { isRestPushConfigured } = await load();
    vi.unstubAllGlobals();
    expect(isRestPushConfigured()).toBe(false);
  });
});

describe("enableRestPush", () => {
  it("subscribes and records the device against the account", async () => {
    const { enableRestPush } = await load();

    expect(await enableRestPush()).toBe(true);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("push_subscriptions?on_conflict=user_id,endpoint");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ user_id: "user-1", endpoint: SUBSCRIPTION.endpoint });
    // Keys go up base64url, which is how the server expects to read them.
    expect(body.p256dh).toMatch(/^[\w-]+$/);
    expect(body.auth).toMatch(/^[\w-]+$/);
  });

  it("reuses an existing browser subscription rather than making a second", async () => {
    getSubscription.mockResolvedValue(SUBSCRIPTION);
    const { enableRestPush } = await load();

    expect(await enableRestPush()).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("declines without notification permission instead of prompting", async () => {
    vi.stubGlobal("Notification", Object.assign(function N() {}, { permission: "default" }));
    const { enableRestPush } = await load();

    expect(await enableRestPush()).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("reports failure rather than throwing when the browser refuses", async () => {
    subscribe.mockRejectedValue(new Error("NotAllowedError"));
    const { enableRestPush } = await load();

    expect(await enableRestPush()).toBe(false);
  });

  it("reports failure when the row cannot be written", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    const { enableRestPush } = await load();

    expect(await enableRestPush()).toBe(false);
  });
});

describe("scheduleRestPush", () => {
  it("does nothing until the device has been registered", async () => {
    // Otherwise there is no subscription for the server to push to, and the
    // row would be orphaned.
    const { scheduleRestPush } = await load();

    scheduleRestPush(Date.now() + 120_000, "Rest complete", "Next set");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("upserts one pending row for this device, and survives being frozen", async () => {
    const { enableRestPush, scheduleRestPush } = await load();
    await enableRestPush();
    vi.mocked(fetch).mockClear();

    const dueAt = Date.now() + 90_000;
    scheduleRestPush(dueAt, "Rest complete", "Next set — Squat");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const request = init as RequestInit;
    expect(String(url)).toContain("scheduled_pushes?on_conflict=subscription_id");
    expect((request.headers as Record<string, string>).Prefer).toContain("merge-duplicates");
    // The only moment worth calling this is the moment the page is being
    // frozen; a normal fetch would be cancelled with it.
    expect(request.keepalive).toBe(true);
    expect(JSON.parse(String(request.body))).toEqual({
      subscription_id: "sub-row-1",
      due_at: new Date(dueAt).toISOString(),
      title: "Rest complete",
      body: "Next set — Squat",
      delivered_at: null,
      attempts: 0,
    });
  });

  it("swallows a failed schedule — the alert is best-effort, the workout is not", async () => {
    const { enableRestPush, scheduleRestPush } = await load();
    await enableRestPush();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    expect(() => scheduleRestPush(Date.now() + 60_000, "a", "b")).not.toThrow();
  });
});

describe("cancelRestPush", () => {
  it("deletes this device's pending row", async () => {
    const { enableRestPush, cancelRestPush } = await load();
    await enableRestPush();
    vi.mocked(fetch).mockClear();

    cancelRestPush();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("scheduled_pushes?subscription_id=eq.sub-row-1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("is a no-op for a device that never registered", async () => {
    const { cancelRestPush } = await load();
    cancelRestPush();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("disableRestPush", () => {
  it("unsubscribes the browser and forgets the row", async () => {
    getSubscription.mockResolvedValue(SUBSCRIPTION);
    const { enableRestPush, disableRestPush, scheduleRestPush } = await load();
    await enableRestPush();
    vi.mocked(fetch).mockClear();

    await disableRestPush();

    expect(SUBSCRIPTION.unsubscribe).toHaveBeenCalled();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("push_subscriptions?id=eq.sub-row-1");
    // And nothing can be scheduled afterwards.
    vi.mocked(fetch).mockClear();
    scheduleRestPush(Date.now() + 60_000, "a", "b");
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { supabase } from "@/lib/supabase";

/**
 * Getting the rest alert to a phone that is locked or put away.
 *
 * The in-app alert (lib/restAlert.ts) only fires while this page's JavaScript
 * is running, and iOS freezes a backgrounded PWA's JS outright — so the one
 * situation a rest timer exists for could not be served from the page at all.
 * Web Push does wake a suspended installed PWA, so the plan is: when the app
 * is backgrounded mid-rest, ask the server to push at the moment rest ends;
 * when it comes back, cancel that.
 *
 * Scheduling only on the way out is what keeps this from double-alerting. A
 * push is only ever pending while the app is not watching, so it cannot
 * arrive alongside the countdown the user is already looking at.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The id of this device's row in push_subscriptions, which every schedule
 *  and cancel refers to. Per-device, so localStorage is the right home. */
const SUBSCRIPTION_ID_KEY = "peak-push-subscription-id";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SUBSCRIPTION_ID_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(SUBSCRIPTION_ID_KEY);
    else window.localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  } catch {
    // Without this the device can still be subscribed; it just cannot
    // schedule, which degrades to the in-app alert.
  }
}

// The access token has to be readable synchronously: the schedule call is made
// from a visibilitychange handler, moments before the OS may freeze this page,
// and there is no time to await a session lookup.
let accessToken: string | null = null;
void supabase.auth.getSession().then(({ data }) => {
  accessToken = data.session?.access_token ?? null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token ?? null;
});

export function isRestPushConfigured(): boolean {
  return Boolean(
    VAPID_PUBLIC_KEY &&
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window
  );
}

/** applicationServerKey wants raw bytes, not the base64url the key is
 *  distributed as. */
function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function keyToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function restUrl(path: string): string {
  return `${SUPABASE_URL}/rest/v1/${path}`;
}

function authHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY ?? "",
    Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

/**
 * Registers this device with the push service and records it against the
 * account. Safe to call repeatedly — the browser returns the existing
 * subscription, and the row is upserted on (user_id, endpoint).
 *
 * Returns false rather than throwing for every ordinary reason this cannot
 * work: no VAPID key configured, permission not granted, a browser without
 * push, a network that is down. The in-app alert still covers the case where
 * the app is open, which is the common one.
 */
export async function enableRestPush(): Promise<boolean> {
  if (!isRestPushConfigured()) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  if (!accessToken) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        // Required by Chrome, and honest: every push this app sends shows a
        // notification.
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY as string) as BufferSource,
      }));

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return false;

    const response = await fetch(restUrl("push_subscriptions?on_conflict=user_id,endpoint"), {
      method: "POST",
      headers: {
        ...authHeaders(),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: keyToBase64Url(subscription.getKey("p256dh")),
        auth: keyToBase64Url(subscription.getKey("auth")),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) return false;

    const rows = (await response.json()) as { id: string }[];
    const id = rows[0]?.id;
    if (!id) return false;
    writeStored(id);
    return true;
  } catch {
    return false;
  }
}

/** Forgets this device, so a user who turns the alert off stops being pushed
 *  to on it. */
export async function disableRestPush(): Promise<void> {
  const id = readStored();
  writeStored(null);
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Unsubscribing locally is best-effort; the row below is what matters.
  }
  if (!id || !SUPABASE_URL) return;
  try {
    await fetch(restUrl(`push_subscriptions?id=eq.${id}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    // A subscription the server cannot reach is dropped by the sender on its
    // first 410 anyway.
  }
}

/**
 * Asks for a push at `dueAt`, replacing whatever was pending for this device.
 *
 * Fire-and-forget with keepalive, because the only moment worth calling this
 * is the moment the app is being backgrounded — a normal fetch is cancelled
 * when the page is frozen, and there is nothing left running to await it.
 */
export function scheduleRestPush(dueAt: number, title: string, body: string): void {
  const subscriptionId = readStored();
  if (!subscriptionId || !accessToken || !SUPABASE_URL) return;

  void fetch(restUrl("scheduled_pushes?on_conflict=subscription_id"), {
    method: "POST",
    headers: {
      ...authHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      subscription_id: subscriptionId,
      due_at: new Date(dueAt).toISOString(),
      title,
      body,
      // Reset rather than inherited: replacing a pending row must re-arm it.
      delivered_at: null,
      attempts: 0,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Drops the pending push — the user came back, or the rest ended while they
 *  were watching. */
export function cancelRestPush(): void {
  const subscriptionId = readStored();
  if (!subscriptionId || !accessToken || !SUPABASE_URL) return;

  void fetch(restUrl(`scheduled_pushes?subscription_id=eq.${subscriptionId}`), {
    method: "DELETE",
    headers: authHeaders(),
    keepalive: true,
  }).catch(() => undefined);
}

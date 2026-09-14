import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { countUnsyncedChanges } from "@/lib/db";
import { getSyncStatus, subscribeSyncStatus, syncNow } from "@/lib/sync";

/** navigator.onLine as a React store, so the bar reacts the moment signal
 *  comes back rather than at the next poll. */
function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const getOnline = () => navigator.onLine;

// How often to re-count while the bar is mounted. Cheap (a few indexed reads)
// and only needed so the count falls to zero shortly after a pass lands.
const POLL_MS = 15_000;

/**
 * Says when work is sitting on this device instead of in the account.
 *
 * "Offline-first" was invisible: you could log a full session in a basement
 * gym, walk out, and have no way to tell whether it had reached your account
 * — and a device whose sync had been failing for a week looked exactly like
 * one that was up to date. This stays out of the way when there is nothing to
 * say, which is almost always.
 */
export function SyncStatusBar({ signedIn }: { signedIn: boolean }) {
  const online = useSyncExternalStore(subscribeOnline, getOnline);
  const { status, error } = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const [pending, setPending] = useState(0);

  const recount = useCallback(() => {
    countUnsyncedChanges()
      .then(setPending)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    recount();
    const iv = setInterval(recount, POLL_MS);
    return () => clearInterval(iv);
  }, [signedIn, recount, status, online]);

  if (!signedIn) return null;

  // Two states are worth a line, and only two. Being offline is one: it
  // explains why nothing is reaching the account and reassures that the work
  // is not lost. A failing sync with work queued behind it is the other.
  //
  // Unsynced work on a healthy online device is NOT one of them — that is
  // just the gap between an edit and the next pass, and showing it would put
  // a bar on screen after every single change the user made.
  const offline = !online;
  const failing = status === "error" && pending > 0;
  if (!offline && !failing) return null;
  const label = offline
    ? pending > 0
      ? `Offline · ${pending} change${pending === 1 ? "" : "s"} saved on this device`
      : "Offline · your workouts are saved on this device"
    : `Not synced · ${pending} change${pending === 1 ? "" : "s"} waiting`;

  return (
    <div
      role="status"
      className="px-5 py-2 flex items-center gap-2"
      style={{
        background: "hsl(var(--surface-sunken))",
        borderBottom: "1px solid hsl(var(--border))",
      }}
    >
      <CloudOff size={14} strokeWidth={2} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
      <span className="text-caption text-muted-foreground" style={{ flex: 1, lineHeight: 1.35 }}>
        {label}
      </span>
      {!offline && (
        <button
          onClick={() => void syncNow()}
          disabled={status === "syncing"}
          className="text-caption flex items-center gap-1.5"
          style={{
            background: "none",
            border: "none",
            color: "hsl(var(--primary))",
            cursor: status === "syncing" ? "default" : "pointer",
            padding: "8px 0 8px 12px",
            minHeight: 40,
            flexShrink: 0,
          }}
        >
          <RefreshCw size={13} strokeWidth={2.5} />
          {status === "syncing" ? "Syncing…" : "Retry"}
        </button>
      )}
      {error && status === "error" && (
        <span className="sr-only">{error}</span>
      )}
    </div>
  );
}

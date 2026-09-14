import { useEffect } from "react";

/**
 * Holds the screen awake while `active` is true.
 *
 * A workout is minutes of standing still between ten-second bursts of typing,
 * so the phone locks constantly — you unlock it again between every set, and
 * on iOS that is Face ID or a passcode with chalk on your hands. The screen
 * staying on for the duration of a session is what the API is for.
 *
 * Browsers revoke the lock whenever the page is hidden and do not restore it
 * on return, so it has to be re-acquired on every visibility change; without
 * that, one glance at a message ends the lock for the rest of the workout.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return;

    let released = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = await wakeLock.request("screen");
      } catch {
        // Denied on a low battery, or blocked by policy. The workout is
        // entirely usable without it; there is nothing to tell the user.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      // Releasing an already-released sentinel rejects; nothing to do about it.
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

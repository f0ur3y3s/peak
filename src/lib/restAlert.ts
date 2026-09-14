/**
 * Telling the lifter that rest is over, when they are not looking at the phone.
 *
 * The countdown itself was the best-built thing in the app and then reached
 * zero and did nothing — no sound, no vibration, nothing. With the phone in a
 * pocket between sets, which is the entire point of a rest timer, the feature
 * did not work: you had to keep watching the screen to know when to stop
 * watching the screen.
 *
 * Three channels, because no single one reaches every device. Vibration is
 * the one that works through a pocket, and iOS Safari does not implement it
 * at all. Sound works on iOS but is silenced by the hardware mute switch.
 * A notification is the only one that reaches a locked screen, and only with
 * permission. So: fire whatever is available and let them overlap.
 */

export type RestAlertMode = "off" | "vibrate" | "sound";

const STORAGE_KEY = "peak-rest-alert";
const DEFAULT_MODE: RestAlertMode = "sound";

/** localStorage throws outright — not returns null — in Safari with site data
 *  blocked, and this runs during render. A preference is never worth a crash. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getRestAlertMode(): RestAlertMode {
  const stored = readStored();
  return stored === "off" || stored === "vibrate" || stored === "sound" ? stored : DEFAULT_MODE;
}

export function setRestAlertMode(mode: RestAlertMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Setting still applies for this session; it just will not be remembered.
  }
}

let audioCtx: AudioContext | null = null;

/**
 * Must be called from inside a real user gesture — logging a set is the
 * natural one, since every rest period starts with one.
 *
 * Mobile browsers refuse to start an AudioContext outside a gesture, and iOS
 * additionally suspends it whenever the app is backgrounded. Creating it at
 * rest-end instead produced a context stuck in "suspended" and a timer that
 * stayed silent with no error anywhere.
 */
export function primeRestAlert(): void {
  if (getRestAlertMode() !== "sound") return;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

/** Two rising notes — short, and distinct from a notification chime so it
 *  reads as "your set" rather than "someone messaged you". */
function beep(): void {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime;
  for (const [i, freq] of [880, 1318.5].entries()) {
    const at = start + i * 0.16;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // An envelope rather than a bare start/stop: switching a full-amplitude
    // oscillator on and off produces an audible click at both ends.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.15);
  }
}

function vibrate(): void {
  try {
    navigator.vibrate?.([140, 90, 140]);
  } catch {
    // Some browsers throw when the document has never been interacted with.
  }
}

function notify(exerciseName: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("Rest complete", {
      body: exerciseName ? `Next set — ${exerciseName}` : "Time to lift",
      tag: "peak-rest",
      // Replaces any previous rest alert rather than stacking one per set.
      renotify: true,
      icon: "/icons/icon-192.png",
    } as NotificationOptions);
  } catch {
    // Chrome on Android requires notifications to come from the service
    // worker; falling back to the in-app channels is the correct outcome.
  }
}

/** Fires every channel the current setting and this device allow. */
export function fireRestAlert(exerciseName = ""): void {
  const mode = getRestAlertMode();
  if (mode === "off") return;
  vibrate();
  if (mode === "sound") beep();
  // Only when they cannot see the countdown — an alert on a screen the user
  // is already looking at is just noise.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    notify(exerciseName);
  }
}

/**
 * Asked for from the Profile toggle, which is a gesture and in context —
 * never on load, where an unexplained permission prompt is the fastest way to
 * get denied permanently.
 */
export async function requestRestNotifications(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

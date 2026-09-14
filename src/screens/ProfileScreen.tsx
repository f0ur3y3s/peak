import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/TopBar";
import { useWeightUnit, type WeightUnit } from "@/lib/weightUnit";
import { getPushedAt } from "@/lib/db";
import { syncNow } from "@/lib/sync";
import {
  getRestAlertMode,
  setRestAlertMode,
  primeRestAlert,
  fireRestAlert,
  requestRestNotifications,
  type RestAlertMode,
} from "@/lib/restAlert";
import { enableRestPush, disableRestPush, isRestPushConfigured } from "@/lib/restPush";

function fmtSyncedAt(ts: number): string {
  const isToday = new Date(ts).toDateString() === new Date().toDateString();
  const time = new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return isToday ? `Today at ${time}` : new Date(ts).toLocaleDateString();
}

interface ProfileScreenProps {
  email: string | null;
  onSignOut: () => void;
}

export function ProfileScreen({ email, onSignOut }: ProfileScreenProps) {
  const { unit, setUnit } = useWeightUnit();
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restAlert, setRestAlert] = useState<RestAlertMode>(getRestAlertMode);
  const [notifyDenied, setNotifyDenied] = useState(false);
  const [pushReady, setPushReady] = useState(false);

  useEffect(() => {
    // The PUSH watermark, not the pull one. lastSyncedAt holds the timestamp
    // of the newest row this device has pulled — minted by whichever device
    // wrote it — so on a device that only ever uploads it sits still for
    // weeks while sync succeeds every five minutes. lastPushedAt is this
    // device's own clock at its last successful pass, which is what "last
    // synced" means to the person reading it.
    getPushedAt().then((v) => setLastSyncedAt(v || null));
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await syncNow();
      if (result.ok) {
        setLastSyncedAt(Date.now());
      } else {
        setSyncError(result.error);
      }
    } catch {
      // runSync resolves rather than rejects, but a caller that leaves the
      // button disabled forever is a bad enough failure to guard twice.
      setSyncError("Sync failed — try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleRestAlert = async (mode: RestAlertMode) => {
    setRestAlert(mode);
    setRestAlertMode(mode);
    if (mode === "off") {
      void disableRestPush();
      return;
    }
    // Both the audio unlock and the permission prompt have to ride a real
    // gesture, and this tap is one. Firing the alert immediately doubles as
    // the answer to "will I actually notice this in a gym?" — the only way to
    // find out otherwise is to be mid-workout when it matters.
    primeRestAlert();
    const permission = await requestRestNotifications();
    setNotifyDenied(permission === "denied");
    fireRestAlert();
    // Registers this device for push, which is the only channel that reaches
    // it once the OS has frozen the page. Quietly does nothing where push is
    // not configured or not permitted.
    if (permission === "granted") setPushReady(await enableRestPush());
  };

  return (
    <div>
      <TopBar title="Profile" />

      <div className="px-5 pt-4 flex flex-col gap-4">
        <Card>
          <CardContent style={{ padding: "16px 20px" }}>
            <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-1.5">
              Signed in as
            </p>
            <p className="text-title font-medium">{email ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: "16px 20px" }}>
            <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2">
              Weight unit
            </p>
            <div className="flex border border-border rounded-lg overflow-hidden">
              {(["kg", "lb"] as WeightUnit[]).map((u) => (
                <Button
                  key={u}
                  variant={unit === u ? "default" : "ghost"}
                  className="flex-1 rounded-none uppercase font-mono text-subtext"
                  onClick={() => setUnit(u)}
                >
                  {u}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: "16px 20px" }}>
            <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-2">
              Rest alert
            </p>
            <div className="flex border border-border rounded-lg overflow-hidden">
              {(
                [
                  ["off", "Off"],
                  ["vibrate", "Vibrate"],
                  ["sound", "Sound"],
                ] as const
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  variant={restAlert === mode ? "default" : "ghost"}
                  className="flex-1 rounded-none font-mono text-subtext"
                  onClick={() => void handleRestAlert(mode)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-caption text-muted-foreground mt-2" style={{ lineHeight: 1.45 }}>
              {notifyDenied
                ? "Notifications are blocked, so the alert only reaches you with the app open. Allow them in your browser settings to be told with the screen off."
                : pushReady
                  ? "Plays when a rest period ends, and reaches this device even with the app closed and the screen off."
                  : isRestPushConfigured()
                    ? "Plays when a rest period ends. Turn it on again once signed in to also be alerted with the app closed."
                    : "Plays when a rest period ends. Sound also vibrates; iPhones ignore vibration, and the mute switch silences sound."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: "16px 20px" }} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-label text-muted-foreground uppercase tracking-widest mb-1">
                  Sync
                </p>
                <p className="text-subtext text-muted-foreground">
                  {lastSyncedAt ? `Last synced ${fmtSyncedAt(lastSyncedAt)}` : "Never synced"}
                </p>
              </div>
              <Button
                variant="outline"
                className="font-mono text-subtext"
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </div>
            {syncError && (
              <p
                role="alert"
                className="font-mono text-caption"
                style={{ color: "hsl(var(--destructive))", margin: 0 }}
              >
                {syncError}
              </p>
            )}
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

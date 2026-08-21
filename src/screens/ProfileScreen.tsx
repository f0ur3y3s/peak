import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/TopBar";
import { useWeightUnit, type WeightUnit } from "@/lib/weightUnit";
import { getSyncedAt } from "@/lib/db";
import { syncNow } from "@/lib/sync";

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

  useEffect(() => {
    getSyncedAt().then((v) => setLastSyncedAt(v || null));
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    const result = await syncNow();
    setSyncing(false);
    if (result.ok) {
      setLastSyncedAt(Date.now());
    } else {
      setSyncError(result.error);
    }
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

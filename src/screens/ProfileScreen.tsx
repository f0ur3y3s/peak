import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/TopBar";
import { useWeightUnit, type WeightUnit } from "@/lib/weightUnit";

interface ProfileScreenProps {
  email: string | null;
  onSignOut: () => void;
}

export function ProfileScreen({ email, onSignOut }: ProfileScreenProps) {
  const { unit, setUnit } = useWeightUnit();

  return (
    <div>
      <TopBar title="Profile" />

      <div className="px-5 pt-4 flex flex-col gap-4">
        <Card>
          <CardContent style={{ padding: "16px 20px" }}>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
              Signed in as
            </p>
            <p className="text-[15px] font-medium">{email ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: "16px 20px" }}>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
              Weight unit
            </p>
            <div className="flex border border-border rounded-lg overflow-hidden">
              {(["kg", "lb"] as WeightUnit[]).map((u) => (
                <Button
                  key={u}
                  variant={unit === u ? "default" : "ghost"}
                  className="flex-1 rounded-none uppercase font-mono text-[13px]"
                  onClick={() => setUnit(u)}
                >
                  {u}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

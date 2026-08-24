import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { subscribeSWUpdate, getSWUpdateReady, applySWUpdate } from "@/lib/swUpdate";

export function UpdateBanner() {
  const ready = useSyncExternalStore(subscribeSWUpdate, getSWUpdateReady);
  if (!ready) return null;

  return (
    <button
      onClick={applySWUpdate}
      className="text-caption"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        // Above everything, including .timer-sheet (80).
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        border: "none",
        borderRadius: 999,
        padding: "9px 16px",
        fontFamily: "'DM Mono', monospace",
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 4px 16px hsl(0 0% 0% / 0.4)",
      }}
    >
      <RefreshCw size={16} strokeWidth={2.5} />
      Update available — tap to refresh
    </button>
  );
}

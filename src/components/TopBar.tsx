import React from "react";
import { ChevronLeft } from "lucide-react";

interface TopBarProps {
  title: string;
  sub?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function TopBar({ title, sub, onBack, right }: TopBarProps) {
  return (
    <div
      className="flex items-center justify-between px-5 pb-3 border-b border-border sticky top-0 z-30 bg-background"
      style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="text-muted-foreground leading-none bg-transparent border-none cursor-pointer flex items-center justify-center"
            style={{ width: 44, height: 44, marginLeft: -11 }}
            aria-label="Go back"
          >
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        )}
        <div>
          <p className="font-title text-lg uppercase tracking-wide text-foreground">{title}</p>
          {sub && (
            <p className="font-mono text-[11px] text-muted-foreground mt-px">{sub}</p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

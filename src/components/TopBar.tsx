import React from "react";

interface TopBarProps {
  title: string;
  sub?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function TopBar({ title, sub, onBack, right }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border sticky top-0 z-30 bg-background">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="text-muted-foreground text-xl leading-none bg-transparent border-none cursor-pointer p-0"
          >
            ←
          </button>
        )}
        <div>
          <p className="font-semibold text-base text-foreground">{title}</p>
          {sub && (
            <p className="font-mono text-[11px] text-muted-foreground mt-px">{sub}</p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

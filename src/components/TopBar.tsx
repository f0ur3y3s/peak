import React from "react";
import { ChevronLeft } from "lucide-react";

export interface Breadcrumb {
  label: string;
  onClick: () => void;
}

interface TopBarProps {
  title: string;
  sub?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  // Ancestor pages above the current title, e.g. [Templates, Push Day A]
  // when viewing an exercise's history from within that template — each
  // crumb jumps straight there instead of requiring several taps of onBack.
  breadcrumb?: Breadcrumb[];
}

export function TopBar({ title, sub, onBack, right, breadcrumb }: TopBarProps) {
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
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 mb-0.5 flex-wrap">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">/</span>
                  )}
                  <button
                    onClick={crumb.onClick}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-transparent border-none cursor-pointer p-0"
                    style={{ textDecoration: "underline", textUnderlineOffset: 2 }}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
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

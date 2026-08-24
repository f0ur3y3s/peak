import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  message: ReactNode;
  action?: EmptyStateAction;
}

// One shared empty-state treatment — previously TemplateDetail, ExercisesScreen,
// and HistoryAnalytics each hand-rolled their own (a plain sentence describing
// an action in prose, a Card-wrapped sentence, etc.). Doesn't include its own
// horizontal padding so it composes with whatever the caller's container uses.
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="py-12 text-center flex flex-col items-center gap-4">
      <p className="text-muted-foreground text-sm max-w-[260px]">{message}</p>
      {action && (
        <Button
          variant={action.variant ?? "default"}
          className={action.variant === "outline" ? undefined : "font-semibold"}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

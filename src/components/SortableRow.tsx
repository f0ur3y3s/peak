import type { HTMLAttributes, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface DragHandleProps extends HTMLAttributes<HTMLElement> {
  ref: (node: HTMLElement | null) => void;
}

interface SortableRowProps {
  id: string;
  children: (handleProps: DragHandleProps) => ReactNode;
}

// Wraps a single row in a dnd-kit sortable list. The drag handle itself is
// rendered by the caller (via the render-prop) so each list can keep its
// own card layout — this only supplies the positioning/transform plumbing
// and the props a handle element needs to spread onto itself.
export function SortableRow({ id, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        boxShadow: isDragging ? "0 8px 24px hsl(0 0% 0% / 0.4)" : undefined,
        borderRadius: "var(--radius)",
      }}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners })}
    </div>
  );
}

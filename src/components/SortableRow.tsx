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

  // CSS.Transform.toString only encodes dnd-kit's translate — append the
  // scale ourselves so the dragged row visibly lifts off the list instead
  // of just following the pointer at its normal size.
  const baseTransform = CSS.Transform.toString(transform);
  const draggingTransform = baseTransform ? `${baseTransform} scale(1.04)` : "scale(1.04)";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: isDragging ? draggingTransform : baseTransform,
        transition,
        zIndex: isDragging ? 10 : undefined,
        boxShadow: isDragging
          ? "0 0 0 2px hsl(var(--primary)), 0 8px 24px hsl(0 0% 0% / 0.4)"
          : undefined,
        borderRadius: "var(--radius)",
      }}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners })}
    </div>
  );
}

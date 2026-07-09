import { useEffect, useRef, useState } from "react";

interface UseDragReorderOptions<T> {
  items: T[];
  getId: (item: T) => string;
  // Called once per drag, with the final order, when the pointer lifts.
  onDrop: (reordered: T[]) => void;
}

// Lightweight pointer-based list reordering — no external dependency,
// matches the pointer-event drag pattern TimerSheet already uses for its
// collapse gesture. The dragged row snaps position with the pointer;
// siblings jump (not animate) out of the way once the dragged row's
// center crosses their midpoint. Good enough for short lists (templates,
// exercises within a template) without pulling in a DnD library.
export function useDragReorder<T>({ items, getId, onDrop }: UseDragReorderOptions<T>) {
  const [order, setOrder] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const startClientYRef = useRef(0);
  const startTopRef = useRef(0);
  const orderRef = useRef(order);
  orderRef.current = order;

  // Stay in sync with the source list (reloads, external edits) whenever
  // we're not mid-drag — mid-drag, `order` is the source of truth.
  useEffect(() => {
    if (!draggingId) setOrder(items);
  }, [items, draggingId]);

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const el = itemRefs.current.get(id);
    if (!el) return;
    startClientYRef.current = e.clientY;
    startTopRef.current = el.getBoundingClientRect().top;
    setDraggingId(id);
    setDragY(0);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId) return;
    const delta = e.clientY - startClientYRef.current;
    setDragY(delta);

    const draggedEl = itemRefs.current.get(draggingId);
    if (!draggedEl) return;
    const draggedHeight = draggedEl.getBoundingClientRect().height;
    const draggedCenter = startTopRef.current + delta + draggedHeight / 2;

    const current = orderRef.current;
    const currentIndex = current.findIndex((it) => getId(it) === draggingId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    for (let i = 0; i < current.length; i++) {
      if (i === currentIndex) continue;
      const el = itemRefs.current.get(getId(current[i]));
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (i > currentIndex && draggedCenter > midpoint) targetIndex = Math.max(targetIndex, i);
      if (i < currentIndex && draggedCenter < midpoint) targetIndex = Math.min(targetIndex, i);
    }

    if (targetIndex !== currentIndex) {
      const next = [...current];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);
      setOrder(next);
    }
  };

  const handlePointerUp = () => {
    if (!draggingId) return;
    setDraggingId(null);
    setDragY(0);
    onDrop(orderRef.current);
  };

  return {
    order,
    draggingId,
    dragY,
    registerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

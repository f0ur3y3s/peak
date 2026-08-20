import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Tracks which <Modal> is topmost so Escape/focus-trap only act on it — several
// screens stack one modal inside another (e.g. ExercisePicker's own overlay
// with a ConfirmDialog rendered on top of it for its delete confirmation), and
// without this both instances' document-level keydown listeners would fire
// for the same keystroke.
const stack: symbol[] = [];

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  /** id of the element (usually the title) that names this dialog for AT. */
  labelledBy: string;
  className?: string;
}

export function Modal({ children, onClose, labelledBy, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(Symbol("modal"));
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = idRef.current;
    stack.push(id);
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // not the topmost modal

      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const idx = stack.indexOf(id);
      if (idx !== -1) stack.splice(idx, 1);
      previouslyFocused.current?.focus();
    };
  }, []);

  return (
    <div className="config-editor-overlay">
      <div
        ref={panelRef}
        className={cn("config-editor-panel", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}

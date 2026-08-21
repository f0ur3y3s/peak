import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <Modal onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="font-semibold text-lg mb-2">{title}</h2>
      <p className="text-subtext text-muted-foreground mb-5">{message}</p>
      <div className="flex gap-2.5">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          className="flex-1 font-semibold"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

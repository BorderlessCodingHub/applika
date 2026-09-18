"use client";

import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  /** The clickable element that opens the dialog (rendered via `asChild`). */
  trigger: ReactNode;
  /** Dialog heading (e.g. "Delete this base CV?"). */
  title: ReactNode;
  /** Supporting copy explaining the consequence. */
  description?: ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red). Defaults to `true`. */
  destructive?: boolean;
  /** Fired when the user confirms. */
  onConfirm: () => void;
  /**
   * Shows a spinner and disables the confirm button. When set, also pass
   * `open`/`onOpenChange` so the parent keeps the dialog open until the async
   * action resolves (confirming will not auto-close in controlled mode).
   */
  loading?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Controlled open-change handler (optional). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Accessible confirmation dialog for destructive actions, built on
 * `AlertDialog`. Focus is trapped and returns to the trigger on close; Escape
 * and the overlay dismiss it. Use it to guard deletes (e.g. removing a base
 * CV). Presentation-only — the parent owns the mutation via `onConfirm`.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  loading = false,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const controlled = onOpenChange != null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              // In controlled mode let the parent close on success so a spinner
              // can show; otherwise fall back to the default auto-close.
              if (controlled) event.preventDefault();
              onConfirm();
            }}
            variant={destructive ? "destructive" : "default"}
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

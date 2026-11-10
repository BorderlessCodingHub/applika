"use client";

import type { ReactNode, RefObject } from "react";
import { Loader2 } from "lucide-react";
import { PhoneSheet } from "@/components/phone/phone-sheet";
import { cn } from "@/lib/utils";

export interface PhoneConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** What the action does; the alert dialog's description. */
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  /** The confirm button's words while `pending` ("Deleting..."); else `confirmLabel`. */
  pendingLabel?: string;
  /** `danger` is the board's `.btn.dan` (Delete, Revoke); `primary` its `.btn.pri`. */
  tone?: "danger" | "primary";
  /** The action is running: both buttons are `aria-disabled`, focus stays. */
  pending?: boolean;
  onConfirm: () => void;
  /** Takes focus on close when the opener is gone (a revoked card, a deleted row). */
  fallbackFocus?: RefObject<HTMLElement | null>;
  /** `data-action` on the confirm button, for tests. */
  confirmAction?: string;
}

/**
 * The boards' confirmation (v2/Cycles "Delete cycle permanently?"): an
 * `alertdialog` sheet, Cancel first and focused, the action filling the row.
 * The caller owns `open`: close it in `onConfirm`, or keep it open while
 * `pending` and close it on success.
 */
export function PhoneConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  tone = "danger",
  pending = false,
  onConfirm,
  fallbackFocus,
  confirmAction,
}: PhoneConfirmSheetProps) {
  return (
    <PhoneSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      alert
      fallbackFocus={fallbackFocus}
      className="ph-sheet-stack"
    >
      <div className="ph-sheet-actions">
        {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
        <button
          type="button"
          aria-disabled={pending || undefined}
          data-disabled={pending || undefined}
          className="ph-btn ph-sec"
          onClick={() => {
            if (!pending) onOpenChange(false);
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          data-disabled={pending || undefined}
          data-action={confirmAction}
          className={cn("ph-btn", tone === "danger" ? "ph-dan" : "ph-pri")}
          onClick={() => {
            if (!pending) onConfirm();
          }}
        >
          {pending ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {pending && pendingLabel ? pendingLabel : confirmLabel}
        </button>
      </div>
    </PhoneSheet>
  );
}

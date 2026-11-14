"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import {
  BadgeCheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { liveCopy, word } from "@/i18n/translator";

/** `admin.catalog.approve.*` in the active language; never spread it. */
export const APPROVE_COPY = liveCopy("admin.catalog.approve", [
  "action",
  "cancel",
  "failed",
]);

export function approveDescription(
  kind: "company" | "platform",
  name: string,
  addedBy: string | null | undefined,
): string {
  return [
    word(`admin.catalog.approve.becomesPublic.${kind}`, { name }),
    addedBy ? word("admin.catalog.approve.keepsAddedBy", { addedBy }) : null,
    word("admin.catalog.approve.permanent"),
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ApproveCatalogButtonProps {
  kind: "company" | "platform";
  name: string;
  /** Shown under the title; companies are told apart by name and URL. */
  url?: string | null;
  addedBy?: string | null;
  /**
   * `POST /admin/{companies|platforms}/{id}/publish`. Resolve with nothing to
   * close; resolve with a message (the 409 `detail`, verbatim) to keep the
   * dialog open and show it. A rejection shows a generic message.
   */
  onApprove: () => Promise<string | void>;
  /** After a successful approve and close. The trigger is about to unmount. */
  onApproved?: () => void;
}

/** `Approve` on a private row, behind an `AlertDialog` confirm. */
export function ApproveCatalogButton({
  kind,
  name,
  url,
  addedBy,
  onApprove,
  onApproved,
}: ApproveCatalogButtonProps) {
  // The copy is read through the module translator: subscribe, so a
  // language switch re-renders the dialog.
  useLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    let message: string | void;
    try {
      message = await onApprove();
    } catch {
      message = APPROVE_COPY.failed;
    }
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    setOpen(false);
    onApproved?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={word("admin.catalog.approve.rowLabel", { name })}
          data-slot="approve-catalog-row"
        >
          <BadgeCheckIcon aria-hidden data-icon="inline-start" />
          {APPROVE_COPY.action}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {word("admin.catalog.approve.title", { name })}
          </AlertDialogTitle>
          {url ? (
            <p className="max-w-full truncate text-xs text-muted-foreground">
              {url}
            </p>
          ) : null}
          <AlertDialogDescription>
            {approveDescription(kind, name, addedBy)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div
            role="alert"
            data-slot="approve-catalog-error"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-pretty text-foreground"
          >
            <CircleAlertIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <p>{error}</p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {APPROVE_COPY.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            aria-busy={pending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {pending ? (
              <LoaderCircleIcon
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {APPROVE_COPY.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

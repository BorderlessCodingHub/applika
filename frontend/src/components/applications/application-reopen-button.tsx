"use client";

import { useLocale } from "next-intl";
import { Loader2, RotateCcw } from "lucide-react";

import { APPLICATION_CLOSE_COPY } from "@/components/applications/application-close-copy";
import { Button } from "@/components/ui/button";

interface ApplicationReopenButtonProps {
  /** Fired on click. The parent owns the mutation. */
  onReopen: () => void;
  /** A reopen is in flight: spinner in place of the icon, button locked. */
  pending?: boolean;
  /**
   * Names the application in the accessible name, e.g. "Backend engineer at
   * Acme". Composed as `Reopen {applicationName}`, so the visible word stays in
   * the name (WCAG 2.5.3).
   */
  applicationName?: string;
  className?: string;
}

/**
 * The one action a closed application offers. Outline + small so it sits in the
 * row's action strip without competing with the icon-only actions it replaces.
 * The label never changes while pending. Presentational.
 */
export function ApplicationReopenButton({
  onReopen,
  pending = false,
  applicationName,
  className,
}: ApplicationReopenButtonProps) {
  // Subscribes: the copy object reads the active language.
  useLocale();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onReopen}
      disabled={pending}
      aria-label={
        applicationName
          ? `${APPLICATION_CLOSE_COPY.reopenAction} ${applicationName}`
          : undefined
      }
      className={className}
    >
      {pending ? (
        <Loader2 aria-hidden className="animate-spin" />
      ) : (
        <RotateCcw aria-hidden />
      )}
      {APPLICATION_CLOSE_COPY.reopenAction}
    </Button>
  );
}

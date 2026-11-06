"use client";

import {
  CircleAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

export interface AutosaveStatusProps {
  status: AutosaveState;
  /** The draft exists and company, role or platform is empty: nothing is sent. Wins over `status`. */
  missingRequired?: boolean;
  /** Shown only in the `error` state. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Where the latest change stands: `Saving...`, `Saved`, `Not saved` with Retry,
 * or the required-fields message. `idle` renders an empty live region, kept
 * mounted so the first change is announced.
 */
export function AutosaveStatus({
  status,
  missingRequired = false,
  onRetry,
  className,
}: AutosaveStatusProps) {
  const t = useTranslations("drafts.page");
  const shown = missingRequired ? "required" : status;

  return (
    <div
      data-slot="autosave-status"
      data-state={shown}
      className={cn("flex min-w-0 items-center gap-2", className)}
    >
      {/* No `role="status"`: the CV copy editor's screen keeps one (frontend/CLAUDE.md). */}
      <p
        aria-live="polite"
        aria-atomic="true"
        className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      >
        {shown === "saving" ? (
          <>
            <LoaderCircleIcon
              aria-hidden
              className="size-4 shrink-0 motion-safe:animate-spin"
            />
            <span>{t("saving")}</span>
          </>
        ) : shown === "saved" ? (
          <>
            <CloudCheckIcon
              aria-hidden
              className="size-4 shrink-0 text-success"
            />
            <span>{t("saved")}</span>
          </>
        ) : shown === "error" ? (
          <>
            <CloudOffIcon
              aria-hidden
              className="size-4 shrink-0 text-destructive"
            />
            <span className="font-medium text-foreground">{t("notSaved")}</span>
          </>
        ) : shown === "required" ? (
          <>
            <CircleAlertIcon
              aria-hidden
              className="size-4 shrink-0 text-warning"
            />
            <span className="text-pretty text-foreground">
              {t("requiredNotSaved")}
            </span>
          </>
        ) : null}
      </p>
      {shown === "error" && onRetry ? (
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          <RotateCcwIcon aria-hidden data-icon="inline-start" />
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}

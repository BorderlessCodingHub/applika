"use client";

import { useEffect, useId, useRef } from "react";
import { LoaderCircle, RefreshCw, Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { FitBadge } from "@/components/jobs/fit-badge";
import { FitKeywords } from "@/components/jobs/fit-keywords";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * The panel's words in the active language (`cvs.fit`). The component reads
 * the same keys through `useTranslations`. Never spread it.
 */
export const CV_FIT_PANEL_COPY = liveCopy("cvs.fit", [
  "title",
  "description",
  "loading",
  "loadError",
  "retry",
  "dirty",
]);

/** `GET /applications/{id}/cv/fit`; structurally the service's `CvFit`. */
export interface CvFitPanelData {
  score: number | null;
  matched_keywords: readonly string[];
  missing_keywords: readonly string[];
}

export type CvFitPanelState = "loading" | "error" | "ready";

export interface CvFitPanelProps {
  /** `undefined`/`null` (no copy, a 404) or `score: null` (blank job description) renders nothing. */
  fit?: CvFitPanelData | null;
  isLoading?: boolean;
  /** A load error other than the 404 (which means "no panel"); wins over `fit`. */
  isError?: boolean;
  /** Renders "Try again" on the error state when given. */
  onRetry?: () => void;
  isRetrying?: boolean;
  /** The copy has unsaved edits; the score is of the saved copy. */
  dirty?: boolean;
  className?: string;
}

/**
 * The CV copy's fit against the application's job description (R-028):
 * `FitBadge` in the header, `FitKeywords` in the body. Same card shell as
 * `JobDescriptionPanel`, so it mounts in `TailoredCvEditor`'s `fit` slot.
 */
export function CvFitPanel({
  fit,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  dirty = false,
  className,
}: CvFitPanelProps) {
  const t = useTranslations("cvs.fit");
  const statusId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const retried = useRef(false);

  const state: CvFitPanelState | null = isLoading
    ? "loading"
    : isError
      ? "error"
      : fit && fit.score !== null
        ? "ready"
        : null;

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state === "error" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    regionRef.current?.focus({ preventScroll: true });
  }, [state]);

  if (state === null) return null;

  const status =
    state === "ready" && fit ? (
      <FitBadge score={fit.score} size="lg" />
    ) : state === "loading" ? (
      <Skeleton aria-hidden className="h-8 w-24 rounded-full" />
    ) : undefined;

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      data-slot="cv-fit-panel"
      data-state={state}
      data-score={
        state === "ready" && fit ? (fit.score ?? undefined) : undefined
      }
      aria-busy={state === "loading" || undefined}
      className={cn("min-w-0 rounded-xl outline-none", className)}
    >
      <CvSectionCard
        title={t("title")}
        description={t("description")}
        icon={Target}
        status={status}
        statusId={statusId}
      >
        {state === "loading" ? (
          // No role="status": the read-only banner is the editor's one status.
          <div className="flex flex-col gap-3">
            <span className="sr-only">{t("loading")}</span>
            {[0, 1].map((row) => (
              <div key={row} aria-hidden className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-20" />
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <div
            role="alert"
            data-slot="cv-fit-error"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-foreground/80">{t("loadError")}</p>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-disabled={isRetrying || undefined}
                aria-busy={isRetrying || undefined}
                className="aria-disabled:opacity-60"
                onClick={() => {
                  if (isRetrying) return;
                  retried.current = true;
                  onRetry();
                }}
              >
                {isRetrying ? (
                  <LoaderCircle
                    aria-hidden
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                  />
                ) : (
                  <RefreshCw aria-hidden data-icon="inline-start" />
                )}
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : fit ? (
          <div className="flex flex-col gap-3">
            <FitKeywords
              matched={fit.matched_keywords}
              missing={fit.missing_keywords}
            />
            {dirty ? (
              <p
                data-slot="cv-fit-dirty"
                className="border-t border-border/60 pt-3 text-xs text-muted-foreground"
              >
                {t("dirty")}
              </p>
            ) : null}
          </div>
        ) : null}
      </CvSectionCard>
    </div>
  );
}

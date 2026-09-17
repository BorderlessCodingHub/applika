"use client";

import { FileText, RotateCcw, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CvCard } from "@/components/base-cvs/cv-card";
import { NewCvCard } from "@/components/base-cvs/new-cv-card";
import { BASE_CVS_MAX, type BaseCv } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** Copy for the zero-CV state. */
export const BASE_CV_EMPTY_TITLE = "No master CVs yet";
export const BASE_CV_EMPTY_BODY =
  "A master CV holds everything about you — identity and contact, a summary, links, skills, experience, projects, certifications and languages. Write it once and reuse it for every application. You can keep up to three.";
export const BASE_CV_EMPTY_CTA = "Create your first CV";

export interface BaseCvListProps {
  /** The user's master CVs. `undefined` while unknown. */
  cvs: BaseCv[] | undefined;
  isLoading?: boolean;
  /** A load error message. Takes precedence over the empty state. */
  error?: string | null;
  /** Renders a retry control on the error state when given. */
  onRetry?: () => void;
  /** Builds the editor link for a CV. */
  editHref: (cv: BaseCv) => string;
  /** Destination of every create affordance. */
  newHref: string;
  onDelete: (cv: BaseCv) => void;
  /** Id of the CV whose delete is in flight. */
  deletingId?: string | null;
  max?: number;
  /** Overrides the on-screen reason on the disabled create tile. */
  limitReason?: string;
  className?: string;
}

/**
 * The `/cvs` gallery and all four of its states: loading, load error, no CVs
 * yet, and one to `max` CVs followed by the create tile. Presentation only —
 * the page owns the queries and the mutations.
 */
export function BaseCvList({
  cvs,
  isLoading = false,
  error,
  onRetry,
  editHref,
  newHref,
  onDelete,
  deletingId,
  max = BASE_CVS_MAX,
  limitReason,
  className,
}: BaseCvListProps) {
  if (isLoading) {
    return (
      <div
        aria-busy
        aria-label="Loading your master CVs"
        className={cn("grid gap-4 md:grid-cols-2", className)}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-52 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/50 bg-destructive/5 px-6 py-16 text-center",
          className,
        )}
      >
        <TriangleAlert aria-hidden className="mb-3 size-8 text-destructive" />
        <p className="text-sm font-medium">Could not load your master CVs</p>
        <p className="mt-1 max-w-sm text-xs text-pretty text-muted-foreground">
          {error}
        </p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-4"
          >
            <RotateCcw aria-hidden />
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  const items = cvs ?? [];

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 py-16 text-center",
          className,
        )}
      >
        <FileText
          aria-hidden
          className="mb-3 size-10 text-muted-foreground/40"
        />
        <h2 className="font-display text-base font-semibold">
          {BASE_CV_EMPTY_TITLE}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">
          {BASE_CV_EMPTY_BODY}
        </p>
        <LinkButton href={newHref} className="mt-5">
          {BASE_CV_EMPTY_CTA}
        </LinkButton>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {items.map((cv) => (
        <CvCard
          key={cv.id}
          cv={cv}
          href={editHref(cv)}
          onDelete={() => onDelete(cv)}
          isDeleting={deletingId === cv.id}
        />
      ))}
      <NewCvCard
        href={newHref}
        count={items.length}
        max={max}
        reason={limitReason}
      />
    </div>
  );
}

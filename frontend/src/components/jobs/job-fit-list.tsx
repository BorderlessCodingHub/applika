"use client";

import { useId } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { FitBadge } from "@/components/jobs/fit-badge";
import { FitKeywords } from "@/components/jobs/fit-keywords";
import { useJobsCopy } from "@/components/jobs/job-copy";
import { MasterCvInvitation } from "@/components/jobs/master-cv-invitation";
import type { JobFit } from "@/services/types/jobs";
import { cn } from "@/lib/utils";

export interface JobFitListCv {
  id: string;
  name: string;
}

export interface JobFitListProps {
  /** The user's master CVs; `undefined` when unknown (then rows come from `fits`). */
  cvs: readonly JobFitListCv[] | undefined;
  fits: readonly JobFit[];
  isLoading?: boolean;
  className?: string;
}

interface FitRow {
  id: string;
  name: string;
  fit: JobFit | undefined;
}

/** R-012: one row per master CV, best first; a CV absent from `fits` reads "No fit yet". */
export function JobFitList({
  cvs,
  fits,
  isLoading = false,
  className,
}: JobFitListProps) {
  const copy = useJobsCopy();
  const headingId = useId();
  const rows: FitRow[] = (
    cvs ?? fits.map((fit) => ({ id: fit.base_cv_id, name: fit.base_cv_name }))
  )
    .map((cv) => ({
      id: cv.id,
      name: cv.name,
      fit: fits.find((fit) => fit.base_cv_id === cv.id),
    }))
    .sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1));

  return (
    <section
      aria-labelledby={headingId}
      data-slot="job-fit-list"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-card",
        className,
      )}
    >
      <div>
        <h2
          id={headingId}
          className="font-display text-base font-semibold text-foreground"
        >
          {copy.fitTitle}
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {copy.fitHint}
        </p>
      </div>

      {isLoading ? (
        <div aria-hidden className="flex flex-col gap-4">
          {[0, 1].map((index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      ) : cvs?.length === 0 ? (
        <MasterCvInvitation />
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground/70">{copy.noFitBody}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {rows.map((row) => (
            <li
              key={row.id}
              data-base-cv-id={row.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 truncate font-display text-sm font-semibold text-foreground">
                  {row.name}
                </h3>
                <FitBadge score={row.fit?.score ?? null} size="lg" />
              </div>
              {row.fit ? (
                <FitKeywords
                  matched={row.fit.matched_keywords}
                  missing={row.fit.missing_keywords}
                />
              ) : (
                <p className="text-sm text-foreground/70">{copy.noFitBody}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

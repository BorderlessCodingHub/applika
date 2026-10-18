"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import {
  BanknoteIcon,
  BriefcaseBusinessIcon,
  EyeOffIcon,
  FilePlus2Icon,
  LoaderCircleIcon,
  MapPinIcon,
  RotateCcwIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FitBadge } from "@/components/jobs/fit-badge";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import {
  JOBS_COPY,
  employmentTypeLabel,
  jobViewHref,
  moreTagsLabel,
  publishedLabel,
  publishedTitle,
} from "@/components/jobs/job-copy";
import type { JobSummary } from "@/services/types/jobs";
import { cn } from "@/lib/utils";

const VISIBLE_TAGS = 6;

export type JobMarkPending = "dismiss" | "restore" | null;

export interface JobListItemProps {
  job: JobSummary;
  /** Absent without the `cvs` feature: then no "Start application" at all. */
  onStart?: (job: JobSummary) => void;
  onDismiss: (job: JobSummary) => void;
  onRestore: (job: JobSummary) => void;
  /** The mark in flight on this job: its button spins and ignores clicks. */
  pending?: JobMarkPending;
  /** `false` without `cvs`: "Draft" is text, since resuming a draft needs it. */
  linkDraft?: boolean;
  headingLevel?: 2 | 3;
  /** Pins "3 days ago" in tests. */
  now?: Date;
  className?: string;
}

/**
 * One job in the list, ported from Ían's `job-card.tsx`. The title link is
 * stretched over the card (`::before`), so the whole card opens the job;
 * every control after it is `relative` and paints above the overlay.
 */
export function JobListItem({
  job,
  onStart,
  onDismiss,
  onRestore,
  pending = null,
  linkDraft = true,
  headingLevel = 2,
  now,
  className,
}: JobListItemProps) {
  const titleId = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const published = publishedLabel(job.posted_at, now);
  const employment = employmentTypeLabel(job.employment_type);
  const visibleTags = job.tags.slice(0, VISIBLE_TAGS);
  const hiddenTags = job.tags.length - visibleTags.length;
  const isPending = pending !== null;
  const MarkIcon = isPending
    ? LoaderCircleIcon
    : job.dismissed
      ? RotateCcwIcon
      : EyeOffIcon;

  return (
    <article
      aria-labelledby={titleId}
      data-slot="job-list-item"
      data-job-id={job.id}
      data-dismissed={job.dismissed ? "" : undefined}
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-border-strong sm:p-5",
        job.dismissed && "border-dashed",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="font-medium tracking-wide-label uppercase">
              {job.source.name}
            </span>
            {published && job.posted_at ? (
              <>
                <span aria-hidden>·</span>
                <time
                  dateTime={job.posted_at}
                  title={publishedTitle(job.posted_at)}
                >
                  {published}
                </time>
              </>
            ) : null}
            {job.dismissed ? (
              <>
                <span aria-hidden>·</span>
                <span
                  data-slot="job-dismissed-mark"
                  className="inline-flex items-center gap-1"
                >
                  <EyeOffIcon aria-hidden className="size-3.5" />
                  {JOBS_COPY.dismissed}
                </span>
              </>
            ) : null}
          </p>
          <Heading className="mt-1 line-clamp-2 font-display text-base leading-snug font-semibold break-words text-foreground">
            <Link
              id={titleId}
              href={jobViewHref(job.id)}
              className="rounded-sm underline-offset-2 outline-none before:absolute before:inset-0 before:rounded-xl hover:underline focus-visible:before:ring-[3px] focus-visible:before:ring-ring/50"
            >
              {job.title}
            </Link>
          </Heading>
          <p className="mt-0.5 truncate text-sm text-foreground/80">
            {job.company_name}
          </p>
        </div>
        {job.best_fit ? (
          <FitBadge score={job.best_fit.score} className="mt-0.5" />
        ) : null}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <MetaItem icon={MapPinIcon}>{job.location_text}</MetaItem>
        {employment ? (
          <MetaItem icon={BriefcaseBusinessIcon}>{employment}</MetaItem>
        ) : null}
        {job.salary_text ? (
          <MetaItem icon={BanknoteIcon}>{job.salary_text}</MetaItem>
        ) : null}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        {visibleTags.length > 0 ? (
          <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => (
              <li key={tag} className="max-w-full min-w-0">
                <Badge variant="secondary" className="max-w-full font-normal">
                  <span className="truncate">{tag}</span>
                </Badge>
              </li>
            ))}
            {hiddenTags > 0 ? (
              <li className="text-xs text-muted-foreground">
                {moreTagsLabel(hiddenTags)}
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="flex items-center justify-end gap-1.5 sm:ml-auto sm:shrink-0">
          {job.application ? (
            <JobStatusBadge
              application={job.application}
              describedBy={titleId}
              linkDraft={linkDraft}
              className="relative mr-auto sm:mr-1.5"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-describedby={titleId}
            aria-disabled={isPending || undefined}
            data-pending={isPending ? "" : undefined}
            onClick={() => {
              if (isPending) return;
              if (job.dismissed) onRestore(job);
              else onDismiss(job);
            }}
            className="relative text-muted-foreground aria-disabled:opacity-70"
          >
            <MarkIcon
              aria-hidden
              data-icon="inline-start"
              className={cn(isPending && "motion-safe:animate-spin")}
            />
            {job.dismissed ? JOBS_COPY.restore : JOBS_COPY.dismiss}
          </Button>
          {/* Always offered with `cvs`, even beside Draft/Applied: starting
              again is how the user reaches "You already have an application". */}
          {onStart ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-describedby={titleId}
              onClick={() => onStart(job)}
              className="relative"
            >
              <FilePlus2Icon aria-hidden data-icon="inline-start" />
              {JOBS_COPY.start}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MetaItem({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex max-w-full min-w-0 items-center gap-1.5">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </li>
  );
}

/** Mirrors the item's rows so the list does not jump when it loads. */
export function JobListItemSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      data-slot="job-list-item-skeleton"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <div className="flex justify-end gap-1.5">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
    </div>
  );
}

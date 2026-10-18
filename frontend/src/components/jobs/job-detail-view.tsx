"use client";

import { useId, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  BanknoteIcon,
  BriefcaseBusinessIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  FilePlus2Icon,
  LoaderCircleIcon,
  MapPinIcon,
  RotateCcwIcon,
  SearchXIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobFitList, type JobFitListCv } from "@/components/jobs/job-fit-list";
import type { JobMarkPending } from "@/components/jobs/job-list-item";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import {
  JOBS_COPY,
  JOBS_HREF,
  employmentTypeLabel,
  isBlankDescription,
  isHttpUrl,
  publishedLabel,
  publishedTitle,
  viewOnSourceLabel,
} from "@/components/jobs/job-copy";
import type { JobDetail } from "@/services/types/jobs";
import { cn } from "@/lib/utils";

export function JobDetailBackLink({ className }: { className?: string }) {
  return (
    <LinkButton
      href={JOBS_HREF}
      variant="ghost"
      size="sm"
      className={cn("-ml-2.5 self-start text-muted-foreground", className)}
    >
      <ArrowLeftIcon aria-hidden data-icon="inline-start" />
      {JOBS_COPY.backToJobs}
    </LinkButton>
  );
}

export interface JobDetailViewProps {
  job: JobDetail;
  /** The user's master CVs, for one fit row each. `[]` shows the invitation (R-015). */
  cvs: readonly JobFitListCv[] | undefined;
  cvsLoading?: boolean;
  /** Absent without the `cvs` feature: then no "Start application" at all. */
  onStart?: (job: JobDetail) => void;
  onDismiss: (job: JobDetail) => void;
  onRestore: (job: JobDetail) => void;
  pending?: JobMarkPending;
  /** `false` without `cvs`: no "Your fit" column (nor its invitation); the description runs full width. */
  showFit?: boolean;
  /** `false` without `cvs`: "Draft" is text, since resuming a draft needs it. */
  linkDraft?: boolean;
  /** Pins "3 days ago" in tests. */
  now?: Date;
  /** Beside the h1, never inside it (the heading's name stays the title): the "Beta" badge. */
  titleBadge?: ReactNode;
  className?: string;
}

/**
 * /jobs/view?id= (R-012): header with the actions, then "Your fit" and the
 * description. Fit comes first in the DOM, so it leads on a phone; from `lg`
 * it sits in the right column.
 */
export function JobDetailView({
  job,
  cvs,
  cvsLoading = false,
  onStart,
  onDismiss,
  onRestore,
  pending = null,
  showFit = true,
  linkDraft = true,
  now,
  titleBadge,
  className,
}: JobDetailViewProps) {
  const titleId = useId();
  const descriptionId = useId();
  const published = publishedLabel(job.posted_at, now);
  const employment = employmentTypeLabel(job.employment_type);
  const isPending = pending !== null;
  const MarkIcon = isPending
    ? LoaderCircleIcon
    : job.dismissed
      ? RotateCcwIcon
      : EyeOffIcon;

  return (
    <div
      data-slot="job-detail"
      data-job-id={job.id}
      className={cn("flex flex-col gap-6", className)}
    >
      <JobDetailBackLink />

      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
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
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* `min-w-0`: `break-words` alone does not let a flex item shrink. */}
            <h1
              id={titleId}
              className="min-w-0 font-display text-2xl font-bold tracking-tight-display text-balance break-words text-foreground sm:text-3xl"
            >
              {job.title}
            </h1>
            {titleBadge}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-foreground/80">
            <span className="min-w-0 break-words">{job.company_name}</span>
            {isHttpUrl(job.company_url) ? (
              <a
                href={job.company_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {JOBS_COPY.companyWebsite}
                <ExternalLinkIcon aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <MetaItem icon={MapPinIcon}>{job.location_text}</MetaItem>
          {employment ? (
            <MetaItem icon={BriefcaseBusinessIcon}>{employment}</MetaItem>
          ) : null}
          {job.salary_text ? (
            <MetaItem icon={BanknoteIcon}>{job.salary_text}</MetaItem>
          ) : null}
        </ul>

        {job.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {job.tags.map((tag) => (
              <li key={tag} className="max-w-full min-w-0">
                <Badge variant="secondary" className="max-w-full font-normal">
                  <span className="truncate">{tag}</span>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {job.is_active ? null : (
          <p
            data-slot="job-inactive-note"
            className="rounded-lg border border-dashed px-3 py-2 text-sm text-foreground/80"
          >
            {JOBS_COPY.inactiveNote}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-y border-border/60 py-3">
          {job.application ? (
            <JobStatusBadge
              application={job.application}
              describedBy={titleId}
              linkDraft={linkDraft}
              className="h-9 px-3 text-sm [&>svg]:size-4"
            />
          ) : null}
          {/* Always offered with `cvs`: starting again opens the existing one. */}
          {onStart ? (
            <Button
              type="button"
              variant={job.application ? "outline" : "default"}
              onClick={() => onStart(job)}
            >
              <FilePlus2Icon aria-hidden data-icon="inline-start" />
              {JOBS_COPY.start}
            </Button>
          ) : null}
          {isHttpUrl(job.job_url) ? (
            <Button asChild variant="outline">
              <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                {viewOnSourceLabel(job.source.name)}
                <ExternalLinkIcon aria-hidden data-icon="inline-end" />
              </a>
            </Button>
          ) : null}
          {job.dismissed ? (
            <span
              data-slot="job-dismissed-mark"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground sm:ml-auto"
            >
              <EyeOffIcon aria-hidden className="size-4" />
              {JOBS_COPY.dismissed}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            aria-disabled={isPending || undefined}
            data-pending={isPending ? "" : undefined}
            onClick={() => {
              if (isPending) return;
              if (job.dismissed) onRestore(job);
              else onDismiss(job);
            }}
            className={cn(
              "text-muted-foreground aria-disabled:opacity-70",
              !job.dismissed && "sm:ml-auto",
            )}
          >
            <MarkIcon
              aria-hidden
              data-icon="inline-start"
              className={cn(isPending && "motion-safe:animate-spin")}
            />
            {job.dismissed ? JOBS_COPY.restore : JOBS_COPY.dismiss}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "grid items-start gap-6",
          showFit && "lg:grid-cols-[minmax(0,1fr)_22rem]",
        )}
      >
        {showFit ? (
          <JobFitList
            cvs={cvs}
            fits={job.fits}
            isLoading={cvsLoading}
            className="lg:col-start-2 lg:row-start-1"
          />
        ) : null}
        <section
          aria-labelledby={descriptionId}
          className="min-w-0 rounded-xl border bg-card p-5 shadow-card sm:p-6 lg:col-start-1 lg:row-start-1"
        >
          <h2
            id={descriptionId}
            className="font-display text-base font-semibold text-foreground"
          >
            {JOBS_COPY.descriptionTitle}
          </h2>
          {isBlankDescription(job.description_text) ? (
            <p className="mt-3 text-sm text-foreground/70">
              {JOBS_COPY.emptyDescription}
            </p>
          ) : (
            <div
              data-slot="job-description"
              className="mt-3 max-w-prose text-sm leading-relaxed break-words whitespace-pre-line text-foreground/90"
            >
              {job.description_text}
            </div>
          )}
        </section>
      </div>
    </div>
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
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="break-words">{children}</span>
    </li>
  );
}

/** `showFit={false}` (no `cvs`) drops the fit column, like the view. */
export function JobDetailSkeleton({ showFit = true }: { showFit?: boolean }) {
  return (
    <div className="flex flex-col gap-6" data-slot="job-detail-loading">
      <JobDetailBackLink />
      <div role="status" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">{JOBS_COPY.loadingJob}</span>
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-48" />
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2 border-y border-border/60 py-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "grid items-start gap-6",
            showFit && "lg:grid-cols-[minmax(0,1fr)_22rem]",
          )}
        >
          {showFit ? (
            <Skeleton className="h-48 w-full rounded-xl lg:col-start-2 lg:row-start-1" />
          ) : null}
          <Skeleton className="h-96 w-full rounded-xl lg:col-start-1 lg:row-start-1" />
        </div>
      </div>
    </div>
  );
}

/** A 404: unknown, or left the list without an application of the user's. Its title is the page's h1. */
export function JobNotListed({ className }: { className?: string }) {
  return (
    <div
      data-slot="job-not-listed"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
        <SearchXIcon aria-hidden className="size-6" />
      </span>
      <h1 className="font-display text-lg font-semibold text-balance text-foreground">
        {JOBS_COPY.notListedTitle}
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
        {JOBS_COPY.notListedBody}
      </p>
      <LinkButton href={JOBS_HREF} variant="outline" className="mt-5">
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        {JOBS_COPY.backToJobs}
      </LinkButton>
    </div>
  );
}

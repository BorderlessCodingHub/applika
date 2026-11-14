"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  EyeOff,
  Loader2,
  RotateCcw,
  SearchX,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import {
  JOBS_HREF,
  clampFit,
  employmentTypeLabel,
  fitBand,
  isBlankDescription,
  isHttpUrl,
  jobApplicationHref,
  publishedLabel,
  viewOnSourceLabel,
} from "@/components/jobs/job-copy";
import type { JobMarkPending } from "@/components/jobs/job-list-item";
import { MasterCvInvitation } from "@/components/jobs/master-cv-invitation";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { PhoneFitRing } from "@/components/phone/phone-fit";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { StartApplicationSheet } from "@/components/phone/screens/start-application-sheet";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useHasFeature } from "@/hooks/use-features";
import {
  apiStatus,
  jobApiDetail,
  useDismissJob,
  useJob,
  useRestoreJob,
} from "@/hooks/use-jobs";
import { unknownErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import type { JobDetail, JobFit } from "@/services/types/jobs";

export interface JobDetailScreenCv {
  id: string;
  name: string;
}

export interface JobDetailScreenViewProps {
  /** `useJob(id)` as a `PhoneLoad`; ignored while `notListed`. */
  job: PhoneLoad<JobDetail>;
  /** No `?id=`, or a 404: "This job is no longer listed", no bar. */
  notListed?: boolean;
  /** With `cvs`: the "Your fit" section, "Start application" and the draft link. */
  showFit: boolean;
  /** `useBaseCvs().data` mapped to `{id, name}`: one tab per master CV; `[]` shows the invitation. */
  cvs: readonly JobDetailScreenCv[] | undefined;
  cvsLoading?: boolean;
  onDismiss: (job: JobDetail) => void;
  onRestore: (job: JobDetail) => void;
  /** The dismiss or restore in flight. */
  pending?: JobMarkPending;
  /** Opens the Start application sheet; absent without `cvs`. */
  onStart?: (job: JobDetail) => void;
  /** Pins "2 hours ago" in tests. */
  now?: Date;
}

interface FitTab {
  id: string;
  name: string;
  fit: JobFit | undefined;
}

/** One tab per master CV, best first; a CV absent from `fits` has no fit yet (today's `JobFitList` order). */
function fitTabs(
  cvs: readonly JobDetailScreenCv[] | undefined,
  fits: readonly JobFit[],
): FitTab[] {
  return (
    cvs ?? fits.map((fit) => ({ id: fit.base_cv_id, name: fit.base_cv_name }))
  )
    .map((cv) => ({
      id: cv.id,
      name: cv.name,
      fit: fits.find((fit) => fit.base_cv_id === cv.id),
    }))
    .sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1));
}

/** v2/JobDetail below md: props in, the board out. */
export function JobDetailScreenView({
  job,
  notListed = false,
  showFit,
  cvs,
  cvsLoading = false,
  onDismiss,
  onRestore,
  pending = null,
  onStart,
  now,
}: JobDetailScreenViewProps) {
  const t = useTranslations("jobs");

  if (notListed) return <JobNotListedPhone />;

  if (job.status !== "ready") {
    return (
      <div data-slot="phone-job-detail" className="ph-app ph-jd ph-jd-nobar">
        {job.status === "error" ? (
          <h1 className="ph-h1 ph-jd-h1">{t("loadJobErrorTitle")}</h1>
        ) : null}
        <PhoneLoadable
          state={job}
          loading={
            <PhoneSkeleton label={t("loadingJob")}>
              <PhoneSkeletonCard className="h-24 bg-transparent shadow-none" />
              <PhoneSkeletonCard className="h-[220px]" />
              <PhoneSkeletonCard className="h-[260px]" />
            </PhoneSkeleton>
          }
        >
          {() => null}
        </PhoneLoadable>
      </div>
    );
  }

  return (
    <JobDetailReady
      job={job.data}
      showFit={showFit}
      cvs={cvs}
      cvsLoading={cvsLoading}
      onDismiss={onDismiss}
      onRestore={onRestore}
      pending={pending}
      onStart={onStart}
      now={now}
    />
  );
}

function JobDetailReady({
  job,
  showFit,
  cvs,
  cvsLoading,
  onDismiss,
  onRestore,
  pending,
  onStart,
  now,
}: Omit<JobDetailScreenViewProps, "job" | "notListed"> & { job: JobDetail }) {
  const t = useTranslations("jobs");
  const tPhone = useTranslations("phone.jobDetail");
  const base = useId();
  const titleId = `${base}-title`;
  const fitHeadingId = `${base}-fit`;
  const descriptionHeadingId = `${base}-description`;
  const published = publishedLabel(job.posted_at, now);
  const employment = employmentTypeLabel(job.employment_type);
  const isPending = pending !== null && pending !== undefined;
  // The board's "Remote · Europe" tag: today's location, employment and salary as trailing tags.
  const facts = [job.location_text, employment, job.salary_text].filter(
    (fact): fact is string => Boolean(fact?.trim()),
  );
  const application = job.application;

  return (
    <div
      data-slot="phone-job-detail"
      data-job-id={job.id}
      className="ph-app ph-jd"
    >
      {isHttpUrl(job.company_url) ? (
        <PhoneTopBarEnd>
          <a
            href={job.company_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("companyWebsite")}
            data-action="company-website"
            className="ph-iconbtn"
          >
            <ExternalLink size={18} aria-hidden="true" />
          </a>
        </PhoneTopBarEnd>
      ) : null}

      <div>
        <p className="ph-jd-meta">
          {job.company_name}
          {" · "}
          {job.source.name}
          {published && job.posted_at ? (
            <>
              {" · "}
              <time dateTime={job.posted_at}>{published}</time>
            </>
          ) : null}
        </p>
        <h1 id={titleId} className="ph-h1 ph-jd-h1">
          {job.title}
        </h1>
        {job.tags.length + facts.length > 0 ? (
          <ul className="ph-jd-tags">
            {[...job.tags, ...facts].map((tag, index) => (
              <li key={`${index}-${tag}`} className="ph-jb-tag-li">
                <span className="ph-tag ph-jb-tag">{tag}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {application || job.dismissed || !job.is_active ? (
          <div className="ph-jd-marks">
            {application ? (
              application.is_draft && !showFit ? (
                <span
                  data-slot="job-status-badge"
                  data-status="draft"
                  className="ph-pill ph-pri"
                >
                  <span className="truncate">{t("draft")}</span>
                </span>
              ) : (
                <Link
                  href={jobApplicationHref(application)}
                  aria-describedby={titleId}
                  data-slot="job-status-badge"
                  data-status={application.is_draft ? "draft" : "applied"}
                  className="ph-hit ph-jb-status"
                >
                  <span className="ph-pill ph-pri">
                    <span className="truncate">
                      {application.is_draft ? t("draft") : t("applied")}
                    </span>
                  </span>
                </Link>
              )
            ) : null}
            {job.dismissed ? (
              <span data-slot="job-dismissed-mark" className="ph-jb-dismissed">
                <EyeOff size={13} aria-hidden="true" />
                {t("dismissed")}
              </span>
            ) : null}
            {job.is_active ? null : (
              <p data-slot="job-inactive-note" className="ph-hint ph-jd-note">
                {t("inactiveNote")}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {showFit ? (
        <section aria-labelledby={fitHeadingId} data-slot="job-fit-list">
          <h2 id={fitHeadingId} className="ph-h2">
            {t("fitTitle")}
          </h2>
          <p className="ph-hint ph-jd-hint">{t("fitHint")}</p>
          {cvsLoading ? (
            <PhoneSkeleton label={tPhone("loadingFit")} className="ph-jd-gap">
              <PhoneSkeletonCard className="h-9 w-48 rounded-full" />
              <PhoneSkeletonCard className="h-[220px]" />
            </PhoneSkeleton>
          ) : cvs?.length === 0 ? (
            <div className="ph-jd-gap">
              <MasterCvInvitation />
            </div>
          ) : (
            <JobFitTabs tabs={fitTabs(cvs, job.fits)} />
          )}
        </section>
      ) : null}

      <section aria-labelledby={descriptionHeadingId}>
        <h2 id={descriptionHeadingId} className="ph-h2">
          {t("descriptionTitle")}
        </h2>
        {isBlankDescription(job.description_text) ? (
          <p className="ph-jd-desc">{t("emptyDescription")}</p>
        ) : (
          <div data-slot="job-description" className="ph-jd-desc">
            {job.description_text}
          </div>
        )}
        {isHttpUrl(job.job_url) ? (
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            data-action="view-on-source"
            className="ph-btn ph-sec ph-jd-source"
          >
            {viewOnSourceLabel(job.source.name)}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        ) : null}
      </section>

      <PhoneActionBar>
        <button
          type="button"
          aria-describedby={titleId}
          aria-disabled={isPending || undefined}
          aria-busy={isPending || undefined}
          data-disabled={isPending || undefined}
          data-action={job.dismissed ? "restore-job" : "dismiss-job"}
          className="ph-btn ph-sec ph-jd-dismiss"
          onClick={() => {
            if (isPending) return;
            if (job.dismissed) onRestore(job);
            else onDismiss(job);
          }}
        >
          {isPending ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : job.dismissed ? (
            <RotateCcw size={16} aria-hidden="true" />
          ) : null}
          {job.dismissed ? t("restore") : t("dismiss")}
        </button>
        {onStart ? (
          <button
            type="button"
            aria-haspopup="dialog"
            data-action="start-application"
            className="ph-btn ph-pri ph-jd-start"
            onClick={() => onStart(job)}
          >
            {t("start")}
          </button>
        ) : null}
      </PhoneActionBar>
    </div>
  );
}

/** The board's CV chips as tabs: one panel per master CV, each with its own (visually hidden) h3. */
function JobFitTabs({ tabs }: { tabs: readonly FitTab[] }) {
  const t = useTranslations("jobs");
  const tPhone = useTranslations("phone.jobDetail");
  const format = useFormatter();
  const [picked, setPicked] = useState<string | null>(null);
  const value =
    picked && tabs.some((tab) => tab.id === picked)
      ? picked
      : (tabs[0]?.id ?? "");

  if (tabs.length === 0) {
    return <p className="ph-hint ph-jd-gap">{t("noFitBody")}</p>;
  }

  return (
    <Tabs.Root
      value={value}
      onValueChange={setPicked}
      activationMode="automatic"
    >
      <Tabs.List
        aria-label={t("cvLegend")}
        data-slot="job-fit-tabs"
        className="ph-hs ph-jd-tabs"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            data-base-cv-id={tab.id}
            className={cn("ph-chip", tab.id === value && "ph-on")}
          >
            <span className="ph-jb-chip-text">
              {tab.fit
                ? tPhone("cvTab", {
                    name: tab.name,
                    score: clampFit(tab.fit.score),
                  })
                : tPhone("cvTabNoFit", { name: tab.name })}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content
          key={tab.id}
          value={tab.id}
          forceMount
          data-base-cv-id={tab.id}
          className="ph-card ph-jd-card"
        >
          <h3 className="ph-sr">{tab.name}</h3>
          {tab.fit ? (
            <>
              <div className="ph-jd-score">
                <PhoneFitRing score={tab.fit.score} />
                <div>
                  <div className="ph-mono ph-jd-pct" aria-hidden="true">
                    {format.number(clampFit(tab.fit.score) / 100, {
                      style: "percent",
                    })}
                  </div>
                  <div className="ph-jd-band">
                    {tPhone(`band.${fitBand(tab.fit.score)}`)}
                  </div>
                </div>
              </div>
              <KeywordGroup
                kind="matched"
                keywords={tab.fit.matched_keywords}
              />
              <KeywordGroup
                kind="missing"
                keywords={tab.fit.missing_keywords}
              />
            </>
          ) : (
            <p className="ph-hint">{t("noFitBody")}</p>
          )}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

function KeywordGroup({
  kind,
  keywords,
}: {
  kind: "matched" | "missing";
  keywords: readonly string[];
}) {
  const t = useTranslations("jobs");
  const labelId = useId();
  return (
    <div data-slot="fit-keyword-group" data-kind={kind}>
      <span id={labelId} className="ph-lbl ph-jd-kw-lbl">
        {kind === "matched" ? t("matched") : t("missing")}
      </span>
      {keywords.length === 0 ? (
        <p className="ph-hint">
          {kind === "matched" ? t("noneMatched") : t("noneMissing")}
        </p>
      ) : (
        <ul aria-labelledby={labelId} className="ph-jd-kws">
          {keywords.map((keyword) => (
            <li key={keyword} className="ph-jb-tag-li">
              <span
                className={cn("ph-kw", kind === "matched" ? "ph-m" : "ph-x")}
              >
                {keyword}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A 404, or no `?id=`: today's words in a board card; the back bar says "Jobs". */
function JobNotListedPhone() {
  const t = useTranslations("jobs");
  return (
    <div data-slot="phone-job-detail" className="ph-app ph-jd ph-jd-nobar">
      <div data-slot="job-not-listed" className="ph-card ph-jd-empty">
        <span className="ph-jd-empty-ic" aria-hidden="true">
          <SearchX size={22} />
        </span>
        <h1 className="ph-jd-empty-h">{t("notListedTitle")}</h1>
        <p className="ph-hint">{t("notListedBody")}</p>
        <Link href={JOBS_HREF} className="ph-btn ph-sm ph-sec">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToJobs")}
        </Link>
      </div>
    </div>
  );
}

/**
 * v2/JobDetail on today's hooks (`job-view-page.tsx`'s `JobView`): the job,
 * the master CVs, dismiss / restore, and Start application as the phone
 * sheet on today's start flow. Fit, Start and a linked Draft need `cvs`.
 */
export function JobDetailScreen() {
  const hasCvs = useHasFeature("cvs").has;
  const id = useSearchParams().get("id");
  const job = useJob(id);
  const baseCvs = useBaseCvs();
  const dismiss = useDismissJob();
  const restore = useRestoreJob();
  const [startOpen, setStartOpen] = useState(false);

  const pending: JobMarkPending = dismiss.isPending
    ? "dismiss"
    : restore.isPending
      ? "restore"
      : null;
  const state: PhoneLoad<JobDetail> = job.isError
    ? {
        status: "error",
        message: jobApiDetail(job.error, unknownErrorMessage()),
        onRetry: () => void job.refetch(),
        retrying: job.isFetching,
      }
    : job.data
      ? { status: "ready", data: job.data }
      : { status: "loading" };

  return (
    <>
      <JobDetailScreenView
        job={state}
        notListed={!id || apiStatus(job.error) === 404}
        showFit={hasCvs}
        cvs={baseCvs.data?.map((cv) => ({ id: cv.id, name: cv.name }))}
        cvsLoading={baseCvs.isLoading}
        onDismiss={(target) => dismiss.mutate(target.id)}
        onRestore={(target) => restore.mutate(target.id)}
        pending={pending}
        onStart={hasCvs ? () => setStartOpen(true) : undefined}
      />
      {hasCvs && job.data ? (
        <StartApplicationSheet
          job={job.data}
          open={startOpen}
          onOpenChange={setStartOpen}
        />
      ) : null}
    </>
  );
}

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  EyeOff,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Toolbar } from "radix-ui";
import { useQueries } from "@tanstack/react-query";
import { toast } from "sonner";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import {
  MIN_FIT_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  advancedJobFilterCount,
  clearJobFilters,
  hasAnyJobFilter,
  jobApplicationHref,
  jobCountLabel,
  jobSourceName,
  jobViewHref,
  minFitOptionLabel,
  moreFiltersLabel,
  moreTagsLabel,
  postedWithinOptionLabel,
  publishedLabel,
  publishedTitle,
  removeTagLabel,
} from "@/components/jobs/job-copy";
import { filtersToSearchParams } from "@/components/jobs/job-filters-url";
import type { JobMarkPending } from "@/components/jobs/job-list-item";
import { MasterCvInvitation } from "@/components/jobs/master-cv-invitation";
import { SavedSearchesMenu } from "@/components/jobs/saved-searches-menu";
import {
  useSavedSearchesMenu,
  useUrlJobFilters,
  writeJobsUrl,
} from "@/components/jobs/use-job-board";
import { PhoneChip } from "@/components/phone/phone-chip";
import { PhoneField, PhoneInput } from "@/components/phone/phone-field";
import { PhoneFitPill } from "@/components/phone/phone-fit";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { PhoneSheet } from "@/components/phone/phone-sheet";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useHasFeature } from "@/hooks/use-features";
import {
  JOBS_QUERY_KEY,
  jobApiDetail,
  useDismissJob,
  useJobs,
  useRestoreJob,
} from "@/hooks/use-jobs";
import { unknownErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import { services } from "@/services/services";
import {
  JOB_FILTER_LIMITS,
  JOB_SOURCES,
  type JobFilters,
  type JobSourceRef,
  type JobSummary,
} from "@/services/types/jobs";

const SEARCH_DEBOUNCE_MS = 300;
/** As today's list item: six tags, then "+N more". */
const VISIBLE_TAGS = 6;

export interface JobsScreenPage {
  /** Every page loaded so far, in order (page 1, then each "Show more"). */
  items: readonly JobSummary[];
  total: number;
}

export interface JobsScreenViewProps {
  /** `useHasFeature("jobs").stage === "beta"`: the board's "Beta" pill in the top bar. */
  beta: boolean;
  /** With `cvs`: the fit pills, "Best fit" and "Minimum fit". Without it none of them. */
  showFit: boolean;
  /** `false` while a `cvs` user has no master CV: "Minimum fit" is locked with its reason. */
  fitAvailable?: boolean;
  /** With `cvs` and no master CV: today's `MasterCvInvitation` above the list. */
  showInvitation?: boolean;
  /** `false` without `cvs`: "Draft" is a mark, not a link (resuming needs `cvs`). */
  linkDraft: boolean;
  /** From the URL (`filtersFromSearchParams`). */
  filters: JobFilters;
  /** Write them back to the URL (`pushState`). Search is debounced here, as today. */
  onFiltersChange: (next: JobFilters) => void;
  /** The pages loaded so far; `fromQuery` over page 1, the rest appended. */
  jobs: PhoneLoad<JobsScreenPage>;
  /** A filter change is loading (`isPlaceholderData`): the list dims, `aria-busy`. */
  refreshing?: boolean;
  /** Another page exists. */
  hasMore: boolean;
  onShowMore: () => void;
  /** The next page is loading: "Show more" spins and ignores taps. */
  loadingMore?: boolean;
  onDismiss: (job: JobSummary) => void;
  onRestore: (job: JobSummary) => void;
  /** The mark in flight per job id: its button spins and ignores taps. */
  pending?: Readonly<Record<string, JobMarkPending>>;
  /** Dismissed on this visit: the board's "2 dismissed · Show dismissed in More filters". */
  dismissedCount?: number;
  /** Today's `SavedSearchesMenu`, wired as on desktop; it sits in the More filters sheet. */
  savedSearches?: ReactNode;
  sources?: readonly JobSourceRef[];
  /** Pins "2 hours ago" in tests. */
  now?: Date;
}

/** v2/Jobs below md: props in, the board out. */
export function JobsScreenView({
  beta,
  showFit,
  fitAvailable = true,
  showInvitation = false,
  linkDraft,
  filters,
  onFiltersChange,
  jobs,
  refreshing = false,
  hasMore,
  onShowMore,
  loadingMore = false,
  onDismiss,
  onRestore,
  pending = {},
  dismissedCount = 0,
  savedSearches,
  sources = JOB_SOURCES,
  now,
}: JobsScreenViewProps) {
  const t = useTranslations("jobs");
  const tPhone = useTranslations("phone.jobs");
  const tFeatures = useTranslations("features");
  const heading = useRef<HTMLHeadingElement>(null);
  const searchId = useId();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // A dismissed job leaves the list with the button that had focus.
  const focusAfterDismiss = useRef(false);
  const items = jobs.status === "ready" ? jobs.data.items : null;
  useEffect(() => {
    if (!focusAfterDismiss.current) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      focusAfterDismiss.current = false;
      heading.current?.focus({ preventScroll: true });
    }
  }, [items]);

  const committedSearch = filters.search ?? "";
  const [searchText, setSearchText] = useState(committedSearch);
  const [seenSearch, setSeenSearch] = useState(committedSearch);
  // A saved search or a clear replaces the text; our own debounced commit does not.
  if (committedSearch !== seenSearch) {
    setSeenSearch(committedSearch);
    if (committedSearch !== searchText.trim()) setSearchText(committedSearch);
  }
  const latest = useRef({ filters, onFiltersChange });
  useEffect(() => {
    latest.current = { filters, onFiltersChange };
  });
  useEffect(() => {
    const next = searchText.trim();
    if (next === (latest.current.filters.search ?? "")) return;
    const timer = window.setTimeout(() => {
      const { filters: current, onFiltersChange: emit } = latest.current;
      emit({ ...current, search: next || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  function flushSearch() {
    const next = searchText.trim();
    if (next !== committedSearch) {
      onFiltersChange({ ...filters, search: next || null });
    }
  }

  const advanced = advancedJobFilterCount(filters);
  const filtered = advanced > 0 || filters.include_dismissed;
  const sourceName = filters.source ? jobSourceName(filters.source) : null;

  return (
    <div data-slot="phone-jobs" className="ph-app ph-jb">
      {beta ? (
        <PhoneTopBarEnd>
          <PhonePill>{tFeatures("beta")}</PhonePill>
        </PhoneTopBarEnd>
      ) : null}

      <div className="ph-jb-head">
        <h1 ref={heading} tabIndex={-1} className="ph-h1 ph-focus-target">
          {t("title")}
        </h1>
        <p className="ph-lead">
          {showFit ? t("subtitle") : t("subtitleNoCvs")}
        </p>
      </div>

      <form
        role="search"
        aria-label={t("filtersLabel")}
        className="ph-jb-search"
        onSubmit={(event) => {
          event.preventDefault();
          flushSearch();
        }}
      >
        <label htmlFor={searchId} className="ph-sr">
          {t("searchLabel")}
        </label>
        <div className="ph-jb-search-box">
          <Search size={18} aria-hidden="true" className="ph-jb-search-ic" />
          <input
            id={searchId}
            type="search"
            enterKeyHint="search"
            maxLength={JOB_FILTER_LIMITS.searchMax}
            placeholder={t("searchLabel")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onBlur={flushSearch}
            className="ph-input ph-jb-search-input"
          />
        </div>
      </form>

      <Toolbar.Root
        aria-label={tPhone("toolbar")}
        data-slot="jobs-toolbar"
        className="ph-hs ph-jb-chips"
      >
        {showFit ? (
          <Toolbar.Button
            type="button"
            aria-pressed={filters.sort === "fit"}
            data-action="sort-fit"
            className={cn("ph-chip", filters.sort === "fit" && "ph-on")}
            onClick={() => onFiltersChange({ ...filters, sort: "fit" })}
          >
            {t("sortFit")}
          </Toolbar.Button>
        ) : null}
        <Toolbar.Button
          type="button"
          aria-pressed={filters.sort === "newest"}
          data-action="sort-newest"
          className={cn("ph-chip", filters.sort === "newest" && "ph-on")}
          onClick={() => onFiltersChange({ ...filters, sort: "newest" })}
        >
          {t("sortNewest")}
        </Toolbar.Button>
        <Toolbar.Button
          type="button"
          aria-haspopup="dialog"
          data-action="choose-source"
          className={cn("ph-chip", sourceName && "ph-on")}
          onClick={() => setSourceOpen(true)}
        >
          <span className="ph-jb-chip-text">
            {sourceName ?? t("allSources")}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Toolbar.Button>
        <Toolbar.Button
          type="button"
          aria-haspopup="dialog"
          data-action="more-filters"
          className={cn("ph-chip", filtered && "ph-on")}
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span className="ph-jb-chip-text">{moreFiltersLabel(advanced)}</span>
        </Toolbar.Button>
      </Toolbar.Root>

      {showInvitation ? (
        <div className="ph-jb-body">
          <MasterCvInvitation />
        </div>
      ) : null}

      <PhoneLoadable
        state={jobs}
        className="ph-jb-results"
        errorClassName="ph-jb-state"
        loading={
          <div className="ph-jb-body">
            <PhoneSkeleton label={t("loadingJobs")}>
              <PhoneSkeletonCard className="h-[148px]" />
              <PhoneSkeletonCard className="h-[148px]" />
              <PhoneSkeletonCard className="h-[148px]" />
            </PhoneSkeleton>
          </div>
        }
      >
        {(page) => (
          <>
            <p className="ph-sr" aria-live="polite" aria-atomic="true">
              {jobCountLabel(page.total)}
            </p>
            {page.items.length === 0 && !hasAnyJobFilter(filters) ? (
              <div
                data-slot="job-list-empty"
                className="ph-card ph-jb-state ph-jb-empty"
              >
                <p className="ph-jb-state-h">{t("emptyTitle")}</p>
                <p className="ph-hint">{t("emptyBody")}</p>
              </div>
            ) : page.items.length === 0 ? (
              <div
                data-slot="job-list-no-matches"
                className="ph-card ph-jb-state ph-jb-empty"
              >
                <p className="ph-jb-state-h">{t("noMatchesTitle")}</p>
                <p className="ph-hint">
                  {showFit ? t("noMatchesBody") : t("noMatchesBodyNoCvs")}
                </p>
                <button
                  type="button"
                  data-action="clear-filters"
                  className="ph-btn ph-sm ph-sec"
                  onClick={() => onFiltersChange(clearJobFilters(filters))}
                >
                  {t("clearFilters")}
                </button>
              </div>
            ) : (
              <ul
                data-slot="job-list"
                aria-busy={refreshing || undefined}
                data-refreshing={refreshing || undefined}
                className="ph-jb-list"
              >
                {page.items.map((job) => (
                  <li key={job.id} data-job-id={job.id}>
                    <PhoneJobCard
                      job={job}
                      linkDraft={linkDraft}
                      pending={pending[job.id] ?? null}
                      now={now}
                      onDismiss={() => {
                        focusAfterDismiss.current = !filters.include_dismissed;
                        onDismiss(job);
                      }}
                      onRestore={() => onRestore(job)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {hasMore && page.items.length > 0 ? (
              <div className="ph-jb-body">
                <button
                  type="button"
                  data-action="show-more"
                  aria-disabled={loadingMore || undefined}
                  aria-busy={loadingMore || undefined}
                  className="ph-show-more ph-jb-more"
                  onClick={() => {
                    if (!loadingMore) onShowMore();
                  }}
                >
                  {loadingMore ? (
                    <Loader2 size={16} aria-hidden="true" className="ph-spin" />
                  ) : null}
                  {tPhone("showMore")}
                </button>
              </div>
            ) : null}
            {page.items.length > 0 ? (
              <p className="ph-hint ph-jb-note">
                {dismissedCount > 0
                  ? tPhone("dismissedNote", { count: dismissedCount })
                  : t("emptyBody")}
              </p>
            ) : null}
          </>
        )}
      </PhoneLoadable>

      <PhoneSheet
        open={sourceOpen}
        onOpenChange={setSourceOpen}
        title={t("sourceLabel")}
        showClose
        fallbackFocus={heading}
        className="ph-sheet-stack"
      >
        <ul data-slot="job-source-options" className="ph-group ph-jb-options">
          {[null, ...sources].map((source) => {
            const code = source?.code ?? null;
            const current = (filters.source ?? null) === code;
            return (
              <li key={code ?? "all"}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  data-source={code ?? "all"}
                  className="ph-row"
                  onClick={() => {
                    if (!current) onFiltersChange({ ...filters, source: code });
                    setSourceOpen(false);
                  }}
                >
                  <span className="ph-grow">
                    {source ? source.name : t("allSources")}
                  </span>
                  {current ? (
                    <Check
                      size={18}
                      aria-hidden="true"
                      className="ph-jb-check"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PhoneSheet>

      <PhoneSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={t("moreFilters")}
        showClose
        fallbackFocus={heading}
      >
        <JobsFiltersBody
          filters={filters}
          onFiltersChange={onFiltersChange}
          showFit={showFit}
          fitAvailable={fitAvailable}
          savedSearches={savedSearches}
        />
        <div className="ph-sheet-actions ph-sheet-foot">
          <button
            type="button"
            data-action="close-filters"
            className="ph-btn ph-pri"
            onClick={() => setFiltersOpen(false)}
          >
            {tPhone("done")}
          </button>
        </div>
      </PhoneSheet>
    </div>
  );
}

function PhoneJobCard({
  job,
  linkDraft,
  pending,
  now,
  onDismiss,
  onRestore,
}: {
  job: JobSummary;
  linkDraft: boolean;
  pending: JobMarkPending;
  now?: Date;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations("jobs");
  const base = useId();
  const titleId = `${base}-title`;
  const subId = `${base}-sub`;
  const fitId = `${base}-fit`;
  const published = publishedLabel(job.posted_at, now);
  const visibleTags = job.tags.slice(0, VISIBLE_TAGS);
  const hiddenTags = job.tags.length - visibleTags.length;
  const isPending = pending !== null;
  const application = job.application;

  return (
    <article
      aria-labelledby={titleId}
      data-slot="job-list-item"
      data-job-id={job.id}
      data-dismissed={job.dismissed ? "" : undefined}
      className="ph-card ph-jb-card"
    >
      <Link
        href={jobViewHref(job.id)}
        aria-labelledby={titleId}
        aria-describedby={job.best_fit ? `${subId} ${fitId}` : subId}
        className="ph-jb-link"
      >
        <div className="ph-jb-top">
          <div className="ph-jb-who">
            <h2 id={titleId} className="ph-jb-title">
              {job.title}
            </h2>
            <p id={subId} className="ph-jb-sub">
              {job.company_name}
              {" · "}
              {job.source.name}
            </p>
          </div>
          {job.best_fit ? (
            <PhoneFitPill id={fitId} score={job.best_fit.score} />
          ) : null}
        </div>
        {visibleTags.length > 0 ? (
          <ul className="ph-jb-tags">
            {visibleTags.map((tag) => (
              <li key={tag} className="ph-jb-tag-li">
                <span className="ph-tag ph-jb-tag">{tag}</span>
              </li>
            ))}
            {hiddenTags > 0 ? (
              <li className="ph-jb-more-tags">{moreTagsLabel(hiddenTags)}</li>
            ) : null}
          </ul>
        ) : null}
      </Link>
      <div className="ph-jb-foot">
        <span className="ph-jb-posted">
          {published && job.posted_at ? (
            <time
              dateTime={job.posted_at}
              title={publishedTitle(job.posted_at)}
            >
              {published}
            </time>
          ) : null}
          {job.dismissed ? (
            <span data-slot="job-dismissed-mark" className="ph-jb-dismissed">
              <EyeOff size={13} aria-hidden="true" />
              {t("dismissed")}
            </span>
          ) : null}
        </span>
        {application ? (
          application.is_draft && !linkDraft ? (
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
        ) : (
          <button
            type="button"
            aria-describedby={titleId}
            aria-disabled={isPending || undefined}
            aria-busy={isPending || undefined}
            data-action={job.dismissed ? "restore-job" : "dismiss-job"}
            className="ph-jb-dismiss"
            onClick={() => {
              if (isPending) return;
              if (job.dismissed) onRestore();
              else onDismiss();
            }}
          >
            {isPending ? (
              <Loader2 size={14} aria-hidden="true" className="ph-spin" />
            ) : job.dismissed ? (
              <RotateCcw size={14} aria-hidden="true" />
            ) : null}
            {job.dismissed ? t("restore") : t("dismiss")}
          </button>
        )}
      </div>
    </article>
  );
}

/** The More filters sheet's body: today's tags, minimum fit, published within and Show dismissed, then saved searches. */
function JobsFiltersBody({
  filters,
  onFiltersChange,
  showFit,
  fitAvailable,
  savedSearches,
}: {
  filters: JobFilters;
  onFiltersChange: (next: JobFilters) => void;
  showFit: boolean;
  fitAvailable: boolean;
  savedSearches?: ReactNode;
}) {
  const t = useTranslations("jobs");
  const base = useId();
  const minFitId = `${base}-min-fit`;
  const minFitHintId = `${base}-min-fit-hint`;
  const postedId = `${base}-posted`;
  const dismissedId = `${base}-dismissed`;
  const [tagText, setTagText] = useState("");
  const tagInput = useRef<HTMLInputElement>(null);
  const tagsFull = filters.tags.length >= JOB_FILTER_LIMITS.tagsMax;

  function addTags(raw: string) {
    setTagText("");
    const next = [...filters.tags];
    for (const part of raw.split(",")) {
      const tag = part.trim().slice(0, JOB_FILTER_LIMITS.tagMax);
      if (!tag || next.includes(tag)) continue;
      if (next.length >= JOB_FILTER_LIMITS.tagsMax) break;
      next.push(tag);
    }
    if (next.length !== filters.tags.length) {
      onFiltersChange({ ...filters, tags: next });
    }
  }

  function removeTag(tag: string) {
    onFiltersChange({
      ...filters,
      tags: filters.tags.filter((item) => item !== tag),
    });
    tagInput.current?.focus();
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagText);
    } else if (
      event.key === "Backspace" &&
      tagText === "" &&
      filters.tags.length > 0
    ) {
      removeTag(filters.tags[filters.tags.length - 1]);
    }
  }

  const minFitOptions = withCurrent(MIN_FIT_OPTIONS, filters.min_fit);
  const postedOptions = withCurrent(
    POSTED_WITHIN_OPTIONS,
    filters.posted_within_days,
  );

  return (
    <div data-slot="job-filters-sheet" className="ph-scroll ph-sheet-body">
      <div className="ph-field">
        <PhoneField
          label={t("tagsLabel")}
          hint={tagsFull ? t("tagsFull") : t("tagsHint")}
        >
          <PhoneInput
            ref={tagInput}
            value={tagText}
            readOnly={tagsFull}
            placeholder={tagsFull ? undefined : t("tagsPlaceholder")}
            maxLength={JOB_FILTER_LIMITS.tagMax}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(event) => setTagText(event.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => {
              if (tagText.trim()) addTags(tagText);
            }}
          />
        </PhoneField>
        {filters.tags.length > 0 ? (
          <ul className="ph-jb-tags">
            {filters.tags.map((tag) => (
              <li key={tag} className="ph-jb-tag-li">
                <span className="ph-tag ph-jb-tag ph-jb-tag-picked">
                  <span className="ph-jb-tag-text">{tag}</span>
                  <button
                    type="button"
                    aria-label={removeTagLabel(tag)}
                    className="ph-hit ph-jb-tag-x"
                    onClick={() => removeTag(tag)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {showFit ? (
        <div
          role="group"
          aria-labelledby={minFitId}
          aria-describedby={fitAvailable ? undefined : minFitHintId}
          className="ph-field"
        >
          <span id={minFitId} className="ph-lbl">
            {t("minFitLabel")}
          </span>
          <div className="ph-jb-chipset">
            <PhoneChip
              pressed={filters.min_fit == null}
              aria-disabled={!fitAvailable || undefined}
              data-disabled={!fitAvailable || undefined}
              onClick={() => {
                if (fitAvailable)
                  onFiltersChange({ ...filters, min_fit: null });
              }}
            >
              {t("anyFit")}
            </PhoneChip>
            {minFitOptions.map((option) => (
              <PhoneChip
                key={option}
                pressed={filters.min_fit === option}
                aria-disabled={!fitAvailable || undefined}
                data-disabled={!fitAvailable || undefined}
                onClick={() => {
                  if (fitAvailable) {
                    onFiltersChange({ ...filters, min_fit: option });
                  }
                }}
              >
                {minFitOptionLabel(option)}
              </PhoneChip>
            ))}
          </div>
          {fitAvailable ? null : (
            <p id={minFitHintId} className="ph-hint">
              {t("minFitNeedsCv")}
            </p>
          )}
        </div>
      ) : null}

      <div role="group" aria-labelledby={postedId} className="ph-field">
        <span id={postedId} className="ph-lbl">
          {t("postedWithinLabel")}
        </span>
        <div className="ph-jb-chipset">
          <PhoneChip
            pressed={filters.posted_within_days == null}
            onClick={() =>
              onFiltersChange({ ...filters, posted_within_days: null })
            }
          >
            {t("anyTime")}
          </PhoneChip>
          {postedOptions.map((option) => (
            <PhoneChip
              key={option}
              pressed={filters.posted_within_days === option}
              onClick={() =>
                onFiltersChange({ ...filters, posted_within_days: option })
              }
            >
              {postedWithinOptionLabel(option)}
            </PhoneChip>
          ))}
        </div>
      </div>

      <div className="ph-jb-toggle">
        <span id={dismissedId}>{t("showDismissed")}</span>
        <PhoneSwitch
          checked={filters.include_dismissed}
          aria-labelledby={dismissedId}
          onCheckedChange={(checked) =>
            onFiltersChange({ ...filters, include_dismissed: checked })
          }
        />
      </div>

      {hasAnyJobFilter(filters) ? (
        <button
          type="button"
          data-action="clear-all-filters"
          className="ph-btn ph-sec"
          onClick={() => onFiltersChange(clearJobFilters(filters))}
        >
          {t("clearAllFilters")}
        </button>
      ) : null}

      {savedSearches ? (
        <div data-slot="job-saved-searches" className="ph-jb-saved">
          {savedSearches}
        </div>
      ) : null}
    </div>
  );
}

function withCurrent(
  options: readonly number[],
  current: number | null,
): number[] {
  if (current == null || options.includes(current)) return [...options];
  return [...options, current].sort((a, b) => a - b);
}

/**
 * v2/Jobs on today's hooks: the URL's filters (`useUrlJobFilters`, written
 * back with `pushState`), page 1 through `useJobs` and every "Show more"
 * page through `useQueries` on the same `["jobs", filters, page]` key (so
 * the optimistic dismiss reaches every loaded page). The phone writes no
 * `?page=`: a filter change starts again at page 1. Fit, the invitation and
 * a linked Draft need `cvs`, as on the desktop.
 */
export function JobsScreen() {
  const beta = useHasFeature("jobs").stage === "beta";
  const hasCvs = useHasFeature("cvs").has;
  const { filters } = useUrlJobFilters(hasCvs);
  const filtersKey = filtersToSearchParams(filters, 1).toString();
  const [paging, setPaging] = useState({ key: filtersKey, pages: 1 });
  if (paging.key !== filtersKey) setPaging({ key: filtersKey, pages: 1 });
  const pages = paging.key === filtersKey ? paging.pages : 1;

  const first = useJobs(filters, 1);
  const more = useQueries({
    queries: Array.from({ length: pages - 1 }, (_, index) => ({
      queryKey: [...JOBS_QUERY_KEY, filters, index + 2],
      queryFn: () => services.jobs.list(filters, index + 2),
    })),
  });

  const baseCvs = useBaseCvs();
  const noMasterCv = hasCvs && baseCvs.isSuccess && baseCvs.data.length === 0;
  const dismiss = useDismissJob();
  const restore = useRestoreJob();
  const [marks, setMarks] = useState<Record<string, JobMarkPending>>({});
  // The jobs dismissed on this visit: a failed dismiss or a restore takes one back out.
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savedSearchesMenu = useSavedSearchesMenu(filters, hasCvs);

  // The pages loaded so far, in order; a page still loading or failed ends the list.
  const items: JobSummary[] = [];
  const seen = new Set<string>();
  let loadedPages = 0;
  let failedPage: (typeof more)[number] | null = null;
  let loadingMore = false;
  for (const page of [first, ...more]) {
    if (!page.data) {
      if (page.isError) failedPage = page;
      else loadingMore = true;
      break;
    }
    loadedPages += 1;
    for (const job of page.data.items) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      items.push(noMasterCv || !hasCvs ? { ...job, best_fit: null } : job);
    }
  }
  const totalPages = first.data?.total_pages ?? 0;

  // A failed "Show more" keeps the list and its button (a tap retries); the toast says why.
  const morePage = failedPage === first ? null : failedPage;
  const moreFailedAt = morePage?.errorUpdatedAt ?? 0;
  const moreFailure = morePage
    ? jobApiDetail(morePage.error, unknownErrorMessage())
    : null;
  useEffect(() => {
    if (moreFailedAt && moreFailure) toast.error(moreFailure);
  }, [moreFailedAt, moreFailure]);

  const jobs: PhoneLoad<JobsScreenPage> = first.isError
    ? {
        status: "error",
        message: jobApiDetail(first.error, unknownErrorMessage()),
        onRetry: () => void first.refetch(),
        retrying: first.isFetching,
      }
    : first.data
      ? { status: "ready", data: { items, total: first.data.total } }
      : { status: "loading" };

  function forgetDismissed(id: string) {
    setDismissedIds((ids) => {
      if (!ids.has(id)) return ids;
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  function setMark(id: string, mark: JobMarkPending) {
    setMarks((current) => {
      const next = { ...current };
      if (mark) next[id] = mark;
      else delete next[id];
      return next;
    });
  }

  return (
    <JobsScreenView
      beta={beta}
      showFit={hasCvs}
      fitAvailable={!noMasterCv}
      showInvitation={noMasterCv}
      linkDraft={hasCvs}
      filters={filters}
      onFiltersChange={(next) => writeJobsUrl(next)}
      jobs={jobs}
      refreshing={first.isPlaceholderData}
      hasMore={loadedPages < totalPages}
      loadingMore={loadingMore && loadedPages > 0}
      onShowMore={() => {
        if (morePage) void morePage.refetch();
        else setPaging({ key: filtersKey, pages: pages + 1 });
      }}
      onDismiss={(job) => {
        setMark(job.id, "dismiss");
        setDismissedIds((ids) => new Set(ids).add(job.id));
        dismiss.mutate(job.id, {
          onError: () => forgetDismissed(job.id),
          onSettled: () => setMark(job.id, null),
        });
      }}
      onRestore={(job) => {
        setMark(job.id, "restore");
        restore.mutate(job.id, {
          onSuccess: () => forgetDismissed(job.id),
          onSettled: () => setMark(job.id, null),
        });
      }}
      pending={marks}
      dismissedCount={filters.include_dismissed ? 0 : dismissedIds.size}
      savedSearches={
        <SavedSearchesMenu {...savedSearchesMenu} className="w-full" />
      }
    />
  );
}

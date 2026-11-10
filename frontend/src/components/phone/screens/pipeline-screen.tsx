"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useOptionalPhoneShell } from "@/components/layout/phone-shell";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import { useAuth } from "@/contexts/auth-context";
import { useCycleContext } from "@/contexts/cycle-context";
import { useDrafts } from "@/hooks/use-application-drafts";
import { useApplications } from "@/hooks/use-applications";
import { useCycles } from "@/hooks/use-cycles";
import { useHasFeature } from "@/hooks/use-features";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useFormatNumber } from "@/i18n/format-number";
import {
  PIPELINE_STAGES,
  ago,
  groupByStage,
  type PipelineAgo,
  type PipelineStage,
} from "@/lib/pipeline";
import {
  calendarDaysBetween,
  companyInitials,
  initials as initialsOf,
} from "@/lib/phone-format";

export interface PipelineRow {
  applicationId: string;
  company: string;
  role: string;
  /** Since `lastUpdate` (the later of the application date and its latest event). */
  ago: PipelineAgo;
  /** `isStale`: open and quiet for more than 14 days. */
  stale: boolean;
  /** A closed application's outcome; `null` shows none. */
  outcome: "denied" | "offer" | null;
}

export interface PipelineGroup {
  stage: PipelineStage;
  /** Every row of the stage, already narrowed by the search; the view shows three under All. */
  rows: readonly PipelineRow[];
}

export interface PipelineDraftRow {
  draftId: string;
  company: string;
  role: string;
  ago: PipelineAgo;
  hasCv: boolean;
}

export interface PipelineList {
  groups: readonly PipelineGroup[];
  /** With `cvs`, on the current cycle: the saved drafts (the Drafts pill shows with one or more). */
  drafts?: readonly PipelineDraftRow[];
}

export type PipelineFilter = "all" | PipelineStage | "drafts";

export interface PipelineScreenViewProps {
  /** Already uppercased (`initials()`). */
  initials: string;
  /** "Current Cycle" or the archived cycle's name. */
  cycleLabel: string;
  /** Every application of the viewed cycle (not narrowed by the search); `undefined` while unknown. */
  total: number | undefined;
  /** An archived cycle: read-only, nothing to create. */
  archived: boolean;
  list: PhoneLoad<PipelineList>;
  filter: PipelineFilter;
  onFilterChange: (filter: PipelineFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** A row's plain tap: the Application screen on this same route (`?focus=`). */
  onOpenApplication: (applicationId: string) => void;
  /** The empty cycle's "Create your first application" (the quick add); absent shows none. */
  onCreateFirst?: () => void;
}

/** Under All, each stage shows this many rows before "Show N more". */
export const PIPELINE_ROWS_PER_GROUP = 3;

const focusHref = (applicationId: string) =>
  `/applications?focus=${encodeURIComponent(applicationId)}`;

/** v2/Pipeline below md: props in, the board out. */
export function PipelineScreenView({
  initials,
  cycleLabel,
  total,
  archived,
  list,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onOpenApplication,
  onCreateFirst,
}: PipelineScreenViewProps) {
  const t = useTranslations("phone.pipeline");
  const tShell = useTranslations("phone.shell");
  const tPage = useTranslations("applications.page");
  const tList = useTranslations("applications.list");
  const formatNumber = useFormatNumber();
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const focusSearch = useRef(false);
  const [searchOpen, setSearchOpen] = useState(query !== "");

  useEffect(() => {
    if (!searchOpen || !focusSearch.current) return;
    focusSearch.current = false;
    searchInput.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    onQueryChange("");
    setSearchOpen(false);
    searchButton.current?.focus();
  };

  const ready = list.status === "ready" ? list.data : null;
  const drafts = ready?.drafts ?? [];
  const hasDrafts = drafts.length > 0;
  // A Drafts pick outlives its pill when the last draft goes: show All.
  const current: PipelineFilter =
    filter === "drafts" && !hasDrafts ? "all" : filter;

  const countOf = (stage: PipelineStage) =>
    ready?.groups.find((group) => group.stage === stage)?.rows.length ?? 0;
  const shown = ready
    ? ready.groups.reduce((sum, group) => sum + group.rows.length, 0)
    : 0;

  const pills: { value: PipelineFilter; label: string; count?: number }[] = [
    { value: "all", label: t("all"), count: ready ? shown : undefined },
    ...PIPELINE_STAGES.map((stage) => ({
      value: stage,
      label: t(`stage.${stage}`),
      count: ready ? countOf(stage) : undefined,
    })),
    ...(hasDrafts
      ? [
          {
            value: "drafts" as const,
            label: tPage("draftsTab"),
            count: drafts.length,
          },
        ]
      : []),
  ];

  return (
    <TabsPrimitive.Root
      value={current}
      onValueChange={(value) => onFilterChange(value as PipelineFilter)}
      data-slot="phone-pipeline"
      data-archived={archived || undefined}
      className="ph-app"
    >
      <div className="ph-pipe-top">
        <div className="ph-pipe-head">
          <div className="ph-pipe-bar">
            <h1 className="ph-h1">{tShell("pipeline")}</h1>
            <button
              ref={searchButton}
              type="button"
              aria-label={t("search")}
              aria-expanded={searchOpen}
              aria-controls={searchId}
              data-action="toggle-search"
              className="ph-iconbtn"
              onClick={() => {
                if (searchOpen) {
                  closeSearch();
                } else {
                  focusSearch.current = true;
                  setSearchOpen(true);
                }
              }}
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <PhoneAvatar initials={initials} />
          </div>
          <p className="ph-pipe-sub" data-slot="pipeline-summary">
            {total === undefined
              ? cycleLabel
              : t("summary", { cycle: cycleLabel, count: total })}
          </p>
          {archived ? (
            <p className="ph-pipe-sub" data-slot="pipeline-archived">
              {tPage("archivedSubtitle")}
            </p>
          ) : null}
          {searchOpen ? (
            <input
              ref={searchInput}
              id={searchId}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label={tPage("searchLabel")}
              placeholder={tPage("searchPlaceholder")}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              className="ph-input ph-pipe-search"
            />
          ) : null}
        </div>

        <TabsPrimitive.List
          aria-label={t("filterLabel")}
          className="ph-hs ph-pipe-pills"
        >
          {pills.map((pill) => (
            <TabsPrimitive.Trigger
              key={pill.value}
              value={pill.value}
              data-filter={pill.value}
              className="ph-stage-pill"
            >
              {pill.label}
              {pill.count !== undefined ? (
                <>
                  {" "}
                  <span className="ph-mono ph-stage-pill-count">
                    {formatNumber(pill.count)}
                  </span>
                </>
              ) : null}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>

      {/* One panel, remounted per filter: "Show N more" starts folded on every pick. */}
      <TabsPrimitive.Content
        key={current}
        value={current}
        tabIndex={-1}
        className="ph-pipe-main"
      >
        <PhoneLoadable
          state={list}
          className="flex flex-col gap-[22px]"
          loading={
            <PhoneSkeleton label={tList("loading")}>
              <PhoneSkeletonCard className="mt-[25px] h-[204px]" />
              <PhoneSkeletonCard className="mt-[47px] h-[204px]" />
            </PhoneSkeleton>
          }
        >
          {(data) => (
            <PipelinePanel
              data={data}
              filter={current}
              query={query}
              archived={archived}
              onQueryChange={onQueryChange}
              onOpenApplication={onOpenApplication}
              onCreateFirst={onCreateFirst}
            />
          )}
        </PhoneLoadable>
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
}

function PipelinePanel({
  data,
  filter,
  query,
  archived,
  onQueryChange,
  onOpenApplication,
  onCreateFirst,
}: {
  data: PipelineList;
  filter: PipelineFilter;
  query: string;
  archived: boolean;
  onQueryChange: (query: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onCreateFirst?: () => void;
}) {
  const tPage = useTranslations("applications.page");

  if (filter === "drafts") {
    return <DraftList drafts={data.drafts ?? []} />;
  }

  const groups = PIPELINE_STAGES.map(
    (stage) =>
      data.groups.find((group) => group.stage === stage) ?? {
        stage,
        rows: [],
      },
  ).filter(
    (group) =>
      group.rows.length > 0 && (filter === "all" || group.stage === filter),
  );

  if (groups.length === 0) {
    const searching = query.trim() !== "";
    const action = searching ? (
      <button
        type="button"
        data-action="clear-search"
        className="ph-btn ph-sm ph-sec"
        onClick={() => onQueryChange("")}
      >
        {tPage("clearFilters")}
      </button>
    ) : filter === "all" && !archived && onCreateFirst ? (
      <button
        type="button"
        aria-haspopup="dialog"
        data-action="create-first"
        className="ph-btn ph-sm ph-sec"
        onClick={onCreateFirst}
      >
        {tPage("emptyAction")}
      </button>
    ) : null;
    return (
      <div
        data-slot="pipeline-empty"
        className="ph-card flex flex-col items-start gap-3 p-[18px]"
      >
        <p className="m-0 text-[14px] text-muted-foreground">
          {tPage("emptyTitle")}
        </p>
        {action}
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <StageGroup
          key={group.stage}
          group={group}
          limit={filter === "all" ? PIPELINE_ROWS_PER_GROUP : undefined}
          onOpenApplication={onOpenApplication}
        />
      ))}
    </>
  );
}

function StageGroup({
  group,
  limit,
  onOpenApplication,
}: {
  group: PipelineGroup;
  limit?: number;
  onOpenApplication: (applicationId: string) => void;
}) {
  const t = useTranslations("phone.pipeline");
  const formatNumber = useFormatNumber();
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const focusFirstShown = useRef(false);
  const [expanded, setExpanded] = useState(false);

  const visible =
    expanded || limit === undefined ? group.rows : group.rows.slice(0, limit);
  const hidden = group.rows.length - visible.length;

  // "Show N more" leaves with the click: focus moves to the first row it showed.
  useLayoutEffect(() => {
    if (!expanded || !focusFirstShown.current || limit === undefined) return;
    focusFirstShown.current = false;
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-application-id]")
      [limit]?.focus();
  }, [expanded, limit]);

  return (
    <section aria-labelledby={headingId} data-stage={group.stage}>
      <h2 id={headingId} className="ph-stage-h">
        <span
          aria-hidden="true"
          className="ph-stage-dot"
          data-stage={group.stage}
        />
        {t(`stage.${group.stage}`)}{" "}
        <span className="ph-mono ph-stage-count">
          {formatNumber(group.rows.length)}
        </span>
      </h2>
      <ul ref={listRef} className="ph-group">
        {visible.map((row) => (
          <PipelineRowItem
            key={row.applicationId}
            row={row}
            stage={group.stage}
            onOpenApplication={onOpenApplication}
          />
        ))}
        {hidden > 0 ? (
          <li>
            <button
              type="button"
              data-action="show-more"
              className="ph-show-more"
              onClick={() => {
                focusFirstShown.current = true;
                setExpanded(true);
              }}
            >
              {t("showMore", { count: formatNumber(hidden) })}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function PipelineRowItem({
  row,
  stage,
  onOpenApplication,
}: {
  row: PipelineRow;
  stage: PipelineStage;
  onOpenApplication: (applicationId: string) => void;
}) {
  const t = useTranslations("phone.pipeline");
  const tEvent = useTranslations("timeline.eventType");
  const companyId = useId();
  const roleId = useId();
  const agoId = useId();
  const staleId = useId();
  const outcomeId = useId();
  const describedBy = [
    roleId,
    agoId,
    row.stale ? staleId : null,
    row.outcome ? outcomeId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li>
      <Link
        href={focusHref(row.applicationId)}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          // A plain tap stays on this route; a new tab or window follows the href.
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onOpenApplication(row.applicationId);
        }}
        aria-labelledby={companyId}
        aria-describedby={describedBy}
        data-application-id={row.applicationId}
        data-stage={stage}
        data-stale={row.stale || undefined}
        className="ph-pipe-row"
      >
        <span aria-hidden="true" className="ph-tile">
          {companyInitials(row.company)}
        </span>
        <span className="ph-pipe-text">
          <span id={companyId} className="ph-pipe-company">
            {row.company}
          </span>
          <span id={roleId} className="ph-pipe-role">
            {row.role}
          </span>
        </span>
        <span className="ph-pipe-meta">
          <span aria-hidden="true" className="ph-mono ph-pipe-ago">
            {t(`ago.${row.ago.unit}`, { count: row.ago.count })}
          </span>
          <span id={agoId} className="ph-sr">
            {t(`agoLong.${row.ago.unit}`, { count: row.ago.count })}
          </span>
          {row.stale ? (
            <span id={staleId} data-slot="pipeline-stale" className="ph-stale">
              <span aria-hidden="true" className="ph-stale-dot" />
              {t("stale")}
            </span>
          ) : null}
          {row.outcome ? (
            <span
              id={outcomeId}
              data-slot="pipeline-outcome"
              data-outcome={row.outcome}
              className="ph-outcome"
            >
              {tEvent(row.outcome)}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function DraftList({ drafts }: { drafts: readonly PipelineDraftRow[] }) {
  return (
    <ul className="ph-group" data-slot="pipeline-drafts">
      {drafts.map((draft) => (
        <DraftRowItem key={draft.draftId} draft={draft} />
      ))}
    </ul>
  );
}

function DraftRowItem({ draft }: { draft: PipelineDraftRow }) {
  const t = useTranslations("phone.pipeline");
  const tDrafts = useTranslations("drafts.section");
  const companyId = useId();
  const roleId = useId();
  const agoId = useId();
  const cvId = useId();

  return (
    <li>
      <Link
        href={`/applications/new-with-cv?id=${encodeURIComponent(draft.draftId)}`}
        aria-labelledby={companyId}
        aria-describedby={[roleId, agoId, draft.hasCv ? cvId : null]
          .filter(Boolean)
          .join(" ")}
        data-draft-id={draft.draftId}
        className="ph-pipe-row"
      >
        <span aria-hidden="true" className="ph-tile">
          {companyInitials(draft.company)}
        </span>
        <span className="ph-pipe-text">
          <span id={companyId} className="ph-pipe-company">
            {draft.company}
          </span>
          <span id={roleId} className="ph-pipe-role">
            {draft.role}
          </span>
        </span>
        <span className="ph-pipe-meta">
          <span aria-hidden="true" className="ph-mono ph-pipe-ago">
            {t(`ago.${draft.ago.unit}`, { count: draft.ago.count })}
          </span>
          <span id={agoId} className="ph-sr">
            {t(`agoLong.${draft.ago.unit}`, { count: draft.ago.count })}
          </span>
          {draft.hasCv ? (
            <span id={cvId} className="ph-outcome">
              {tDrafts("cvCopy")}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export interface PipelineScreenProps {
  /** A row's tap: the Application screen, on this same route. */
  onOpenApplication: (applicationId: string) => void;
}

/**
 * v2/Pipeline, wired: the viewed cycle's applications
 * (`useApplications(selectedCycleId)`, its search filter) grouped by
 * `pipelineStage`, with Stale and the outcome; the Drafts pill with `cvs`
 * on the current cycle; an archived cycle read-only. The cycle
 * itself is chosen on Insights.
 */
export function PipelineScreen({ onOpenApplication }: PipelineScreenProps) {
  const tCycle = useTranslations("cycleSelector");
  const { user } = useAuth();
  const now = useMinuteClock();
  const shell = useOptionalPhoneShell();
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();
  const cycles = useCycles();
  const apps = useApplications(selectedCycleId);
  const { has: hasCvs } = useHasFeature("cvs");
  // As on the desktop: drafts only where the create actions are.
  const drafts = useDrafts(hasCvs && !isViewingPastCycle);
  const [filter, setFilter] = useState<PipelineFilter>("all");

  const cycleLabel =
    selectedCycleId === null
      ? tCycle("current")
      : (cycles.data?.find((cycle) => cycle.id === selectedCycleId)?.name ??
        "");

  const list = mapLoad(
    fromQuery({
      data: apps.applications === undefined ? undefined : apps.filtered,
      isError: apps.isError,
      error: apps.error,
      isFetching: apps.isFetching,
      refetch: apps.refetch,
    }),
    (filtered): PipelineList => ({
      groups: groupByStage(filtered, now).map(({ stage, rows }) => ({
        stage,
        rows: rows.map((row) => ({
          applicationId: row.app.id,
          company: row.app.company_name,
          role: row.app.role,
          ago: ago(row.days),
          stale: row.stale,
          outcome: row.outcome,
        })),
      })),
      drafts:
        hasCvs && !isViewingPastCycle && drafts.data
          ? drafts.data.map((draft) => ({
              draftId: draft.id,
              company: draft.company_name,
              role: draft.role,
              ago: ago(
                calendarDaysBetween(
                  new Date(draft.updated_at ?? draft.created_at),
                  now,
                ),
              ),
              hasCv: draft.has_cv,
            }))
          : undefined,
    }),
  );

  return (
    <PipelineScreenView
      initials={user ? initialsOf(user) : ""}
      cycleLabel={cycleLabel}
      total={apps.applications?.length}
      archived={isViewingPastCycle}
      list={list}
      filter={filter}
      onFilterChange={setFilter}
      query={apps.filters.search ?? ""}
      onQueryChange={(value) =>
        apps.updateFilter("search", value === "" ? undefined : value)
      }
      onOpenApplication={onOpenApplication}
      onCreateFirst={
        !isViewingPastCycle && shell ? shell.openQuickAdd : undefined
      }
    />
  );
}

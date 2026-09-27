"use client";

import { useState } from "react";
import type { AxiosError } from "axios";
import {
  Briefcase,
  CalendarClock,
  Filter,
  History,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";

import {
  AGENDA_PAGE_COPY,
  agendaItemNames,
  agendaTabLabel,
} from "@/components/agenda/agenda-copy";
import { AgendaCardTimeline } from "@/components/agenda/agenda-card-timeline";
import { AgendaDateGroup } from "@/components/agenda/agenda-date-group";
import { AgendaItemCard } from "@/components/agenda/agenda-item-card";
import { AgendaSkeleton } from "@/components/agenda/agenda-skeleton";
import {
  filterAgenda,
  getDisplayTime,
  groupByDate,
  splitAgenda,
} from "@/components/agenda/agenda-view";
import { IconTile } from "@/components/applications/icon-tile";
import { EmptyState } from "@/components/common/empty-state";
import { INTERVIEW_TYPE_OPTIONS } from "@/components/timeline/timeline-options";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgendaNotifications } from "@/contexts/agenda-notifications-context";
import { useAgenda } from "@/hooks/use-user";
import { useTimeline } from "@/hooks/use-timeline";
import { getApiError } from "@/lib/api-client";
import { genAgendaStepIcsFile } from "@/lib/calendar";
import { toTimelineEventViews } from "@/lib/timeline-view";
import type { AgendaStep } from "@/services/types/applications";

interface AgendaTabPanelProps {
  tab: "upcoming" | "past";
  items: AgendaStep[];
  hadItemsBeforeFilter: boolean;
  isEnabled: (id: string) => boolean;
  toggle: (id: string) => void;
}

/**
 * The chevron body (R-012, KODI-038). Rendered as `AgendaItemCard`'s
 * `children`, so Radix `CollapsibleContent` (unmounts while closed, see
 * `collapsible.tsx`) is what makes this load only once the card is opened —
 * no `open` state is lifted into the page. Read-only: no `renderActions`.
 */
function AgendaCardTimelineBody({ step }: { step: AgendaStep }) {
  const { data, isPending, isError, error, refetch, isFetching } = useTimeline(
    step.application_id,
  );
  const names = agendaItemNames(step.role, step.company_name);

  return (
    <AgendaCardTimeline
      status={isPending ? "loading" : isError ? "error" : "success"}
      label={names.timeline}
      events={toTimelineEventViews(data ?? [])}
      errorDetail={isError ? getApiError(error as AxiosError) : undefined}
      onRetry={() => void refetch()}
      retrying={isFetching}
    />
  );
}

function AgendaTabPanel({
  tab,
  items,
  hadItemsBeforeFilter,
  isEnabled,
  toggle,
}: AgendaTabPanelProps) {
  function handleDownload(step: AgendaStep) {
    genAgendaStepIcsFile(step);
    toast.success("Calendar event downloaded");
  }

  if (items.length === 0) {
    if (hadItemsBeforeFilter) {
      return (
        <EmptyState icon={SearchX} title={AGENDA_PAGE_COPY.emptyFiltered} />
      );
    }
    return (
      <EmptyState
        icon={tab === "upcoming" ? CalendarClock : History}
        title={
          tab === "upcoming"
            ? AGENDA_PAGE_COPY.emptyUpcoming
            : AGENDA_PAGE_COPY.emptyPast
        }
        action={
          <LinkButton href="/applications" variant="outline">
            <Briefcase aria-hidden data-icon="inline-start" />
            {AGENDA_PAGE_COPY.goToApplications}
          </LinkButton>
        }
      />
    );
  }

  const groups = groupByDate(items);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <AgendaDateGroup
          key={group.date}
          date={group.date}
          count={group.steps.length}
        >
          {group.steps.map((step) => {
            const displayTime = getDisplayTime(step);
            const alert =
              tab === "upcoming" && step.start_time
                ? {
                    enabled: isEnabled(step.id),
                    onToggle: () => toggle(step.id),
                  }
                : undefined;
            return (
              <AgendaItemCard
                key={step.id}
                step={step}
                displayTime={displayTime}
                onDownloadCalendar={() => handleDownload(step)}
                alert={alert}
              >
                <AgendaCardTimelineBody step={step} />
              </AgendaItemCard>
            );
          })}
        </AgendaDateGroup>
      ))}
    </div>
  );
}

export function AgendaPage() {
  const { data: steps, isLoading, isError, error, refetch } = useAgenda();
  const { toggle, isEnabled } = useAgendaNotifications();
  const [search, setSearch] = useState("");
  const [interviewType, setInterviewType] = useState("all");

  const filtered = steps ? filterAgenda(steps, { search, interviewType }) : [];
  const { upcoming, past } = splitAgenda(filtered);
  const hasFilter = search.trim() !== "" || interviewType !== "all";
  const hadUpcomingBeforeFilter = steps
    ? splitAgenda(steps).upcoming.length > 0
    : false;
  const hadPastBeforeFilter = steps
    ? splitAgenda(steps).past.length > 0
    : false;

  const countsReady = !isLoading && !isError;

  function renderPanel(
    tab: "upcoming" | "past",
    items: AgendaStep[],
    hadItemsBeforeFilter: boolean,
  ) {
    if (isError) {
      return (
        <div role="alert">
          <EmptyState
            icon={RefreshCw}
            title={AGENDA_PAGE_COPY.loadErrorTitle}
            description={getApiError(error as AxiosError)}
            action={
              <Button onClick={() => void refetch()}>
                <RefreshCw aria-hidden data-icon="inline-start" />
                {AGENDA_PAGE_COPY.retry}
              </Button>
            }
          />
        </div>
      );
    }
    if (isLoading) {
      return <AgendaSkeleton />;
    }
    return (
      <AgendaTabPanel
        tab={tab}
        items={items}
        hadItemsBeforeFilter={hadItemsBeforeFilter}
        isEnabled={isEnabled}
        toggle={toggle}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <IconTile icon={CalendarClock} tone="primary" size="sm" />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground sm:text-3xl">
              {AGENDA_PAGE_COPY.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {AGENDA_PAGE_COPY.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 xl:flex-nowrap">
          <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-0 xl:w-80 xl:flex-none">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={AGENDA_PAGE_COPY.searchPlaceholder}
              aria-label={AGENDA_PAGE_COPY.searchLabel}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10"
            />
          </div>

          <Select value={interviewType} onValueChange={setInterviewType}>
            <SelectTrigger
              aria-label={AGENDA_PAGE_COPY.stageFilterLabel}
              className="h-11 flex-1 data-[size=default]:h-11 *:data-[slot=select-value]:flex-1 sm:w-48 sm:flex-none"
            >
              <Filter aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">
                  {AGENDA_PAGE_COPY.allStages}
                </SelectItem>
                {INTERVIEW_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="gap-6">
        <TabsList variant="line">
          <TabsTrigger
            value="upcoming"
            className="group/agenda-tab"
            aria-label={
              countsReady
                ? agendaTabLabel(AGENDA_PAGE_COPY.upcomingTab, upcoming.length)
                : undefined
            }
          >
            {AGENDA_PAGE_COPY.upcomingTab}
            {countsReady && (
              <Badge
                aria-hidden="true"
                variant="secondary"
                className="font-numeric group-data-[state=active]/agenda-tab:bg-primary/20"
              >
                {upcoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="group/agenda-tab"
            aria-label={
              countsReady
                ? agendaTabLabel(AGENDA_PAGE_COPY.pastTab, past.length)
                : undefined
            }
          >
            {AGENDA_PAGE_COPY.pastTab}
            {countsReady && (
              <Badge
                aria-hidden="true"
                variant="secondary"
                className="font-numeric group-data-[state=active]/agenda-tab:bg-primary/20"
              >
                {past.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="flex flex-col gap-6">
          {renderPanel(
            "upcoming",
            upcoming,
            hasFilter && hadUpcomingBeforeFilter,
          )}
        </TabsContent>
        <TabsContent value="past" className="flex flex-col gap-6">
          {renderPanel("past", past, hasFilter && hadPastBeforeFilter)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

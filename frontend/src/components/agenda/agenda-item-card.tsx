"use client";

import { useId, type ReactNode } from "react";
import {
  Bell,
  BellRing,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
} from "lucide-react";

import {
  AGENDA_CARD_COPY,
  agendaItemNames,
  formatAgendaDate,
} from "@/components/agenda/agenda-copy";
import { IconTile } from "@/components/applications/icon-tile";
import {
  EVENT_TYPE_CONFIG,
  stageLabel,
} from "@/components/timeline/timeline-options";
import { timeZoneLabel } from "@/components/timeline/timezone-options";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgendaStep } from "@/services/types/applications";

/** Shape of `getDisplayTime(step)`: local "HH:mm" times. */
export interface AgendaDisplayTime {
  time: string;
  endTime?: string;
  /** The step's zone is not the viewer's, so both times were converted. */
  converted: boolean;
}

export interface AgendaItemAlert {
  enabled: boolean;
  onToggle: () => void;
}

interface AgendaItemCardProps {
  step: AgendaStep;
  /** `null` for a step without a start time: the time column says "All day". */
  displayTime: AgendaDisplayTime | null;
  onDownloadCalendar: () => void;
  /** Omit to hide the alert button (Past tab, or no start time). */
  alert?: AgendaItemAlert;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Body the chevron reveals under the card. */
  children?: ReactNode;
  className?: string;
}

const SQUARE_ICON = "[&_svg:not([class*='size-'])]:size-4.5";

function AgendaTimeColumn({
  displayTime,
}: {
  displayTime: AgendaDisplayTime | null;
}) {
  return (
    <div
      data-slot="agenda-time"
      // Timed: the meta row already reads the range, so hide the duplicate.
      aria-hidden={displayTime ? true : undefined}
      className="flex items-baseline gap-1.5 @lg/agenda-card:w-16 @lg/agenda-card:shrink-0 @lg/agenda-card:flex-col @lg/agenda-card:items-start @lg/agenda-card:gap-0"
    >
      {displayTime ? (
        <>
          <span className="font-numeric text-base font-semibold text-foreground">
            {displayTime.time}
          </span>
          {displayTime.endTime ? (
            <>
              <span className="text-sm text-muted-foreground @lg/agenda-card:hidden">
                -
              </span>
              <span className="font-numeric text-sm text-muted-foreground">
                {displayTime.endTime}
              </span>
            </>
          ) : null}
        </>
      ) : (
        <span className="text-sm leading-6 font-semibold text-foreground">
          {AGENDA_CARD_COPY.allDay}
        </span>
      )}
    </div>
  );
}

export function AgendaItemCard({
  step,
  displayTime,
  onDownloadCalendar,
  alert,
  open,
  onOpenChange,
  children,
  className,
}: AgendaItemCardProps) {
  const companyId = useId();
  const roleId = useId();
  const names = agendaItemNames(step.role, step.company_name);
  const config = EVENT_TYPE_CONFIG[step.event_type];
  const note = step.observation?.trim();

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <article
        aria-labelledby={`${companyId} ${roleId}`}
        data-slot="agenda-item-card"
        data-step-id={step.id}
        data-event-type={step.event_type}
        className={cn(
          "@container/agenda-card rounded-xl border border-border bg-card shadow-card transition-shadow data-[state=open]:shadow-elevated",
          className,
        )}
      >
        <div className="flex flex-col gap-2 p-4 @lg/agenda-card:flex-row @lg/agenda-card:gap-4 @lg/agenda-card:p-5">
          <AgendaTimeColumn displayTime={displayTime} />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <IconTile
                icon={Building2}
                className="order-1 hidden @lg/agenda-card:inline-flex"
              />

              <div className="order-2 min-w-0 flex-1 basis-0">
                <h3
                  id={companyId}
                  className="font-display text-base font-semibold break-words text-foreground"
                >
                  {step.company_name}
                </h3>
                <p
                  id={roleId}
                  className="mt-0.5 text-sm break-words text-muted-foreground"
                >
                  {step.role}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden className="size-3.5 shrink-0" />
                    <time dateTime={step.step_date}>
                      {formatAgendaDate(step.step_date)}
                    </time>
                  </span>
                  {displayTime ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock aria-hidden className="size-3.5 shrink-0" />
                      <span>
                        {displayTime.endTime
                          ? `${displayTime.time} - ${displayTime.endTime}`
                          : displayTime.time}
                      </span>
                      {displayTime.converted ? (
                        <span>{AGENDA_CARD_COPY.converted}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {step.timezone ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin aria-hidden className="size-3.5 shrink-0" />
                      <span className="break-words">
                        {timeZoneLabel(step.timezone)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="order-4 flex shrink-0 basis-full flex-wrap items-center gap-2 @3xl/agenda-card:basis-auto">
                <Badge
                  data-slot="agenda-stage-pill"
                  className={cn("h-6 gap-1.5 px-2.5", config.badgeClass)}
                >
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", config.dotClass)}
                  />
                  {stageLabel(step.event_type, step.interview_type)}
                </Badge>

                {alert ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={alert.enabled ? "default" : "secondary"}
                        size="icon-sm"
                        aria-label={names.alerts}
                        aria-pressed={alert.enabled}
                        data-agenda-action="alert"
                        onClick={alert.onToggle}
                        className={SQUARE_ICON}
                      >
                        {alert.enabled ? (
                          <BellRing aria-hidden />
                        ) : (
                          <Bell aria-hidden />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {alert.enabled
                        ? AGENDA_CARD_COPY.alertOnTooltip
                        : AGENDA_CARD_COPY.alertOffTooltip}
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      aria-label={names.addToCalendar}
                      data-agenda-action="calendar"
                      onClick={onDownloadCalendar}
                      className={SQUARE_ICON}
                    >
                      <CalendarPlus aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {AGENDA_CARD_COPY.addToCalendarTooltip}
                  </TooltipContent>
                </Tooltip>
              </div>

              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={names.timeline}
                  className={cn(
                    "order-3 shrink-0 @3xl/agenda-card:order-5",
                    "[&_svg:not([class*='size-'])]:size-5",
                    "[&>svg]:transition-transform motion-reduce:[&>svg]:transition-none [&[data-state=open]>svg]:rotate-180",
                  )}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </CollapsibleTrigger>
            </div>

            <div
              data-slot="agenda-item-note"
              className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated py-1.5 pr-1.5 pl-4"
            >
              <FileText aria-hidden className="mt-2 size-4 shrink-0" />
              {note ? (
                <p className="min-w-0 flex-1 py-1.5 text-sm break-words whitespace-pre-wrap text-foreground">
                  {note}
                </p>
              ) : (
                <p className="min-w-0 flex-1 py-1.5 text-sm text-muted-foreground">
                  {AGENDA_CARD_COPY.noNotes}
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <LinkButton
                    href={`/applications?focus=${step.application_id}`}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={names.open}
                    className={cn("shrink-0", SQUARE_ICON)}
                  >
                    <ExternalLink aria-hidden />
                  </LinkButton>
                </TooltipTrigger>
                <TooltipContent>{AGENDA_CARD_COPY.openTooltip}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <CollapsibleContent
          className={cn(
            children != null &&
              "px-4 pb-4 @lg/agenda-card:px-5 @lg/agenda-card:pb-5",
          )}
        >
          {children}
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

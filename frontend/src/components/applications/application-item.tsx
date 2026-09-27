"use client";

import { useId, useState } from "react";
import {
  Banknote,
  Building2,
  Calendar,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  GraduationCap,
  MapPin,
  NotebookText,
  SquarePen,
  FileText,
  Flag,
  Trash2,
  Wallet,
  Wifi,
} from "lucide-react";

import {
  ApplicationDetailsPanel,
  ApplicationDetailTile,
} from "@/components/applications/application-detail-tile";
import { ApplicationIconAction } from "@/components/applications/application-icon-action";
import {
  APPLICATION_ACTION_COPY,
  APPLICATION_ACTIVE_LABEL,
  APPLICATION_DETAIL_LABELS,
  applicationName,
} from "@/components/applications/application-card-copy";
import {
  APPLICATION_CLOSED_LABEL,
  CLOSE_ACTION_LABEL,
} from "@/components/applications/application-close-copy";
import { ApplicationReopenButton } from "@/components/applications/application-reopen-button";
import { ApplicationStatusPill } from "@/components/applications/application-status-pill";
import { formatSalary } from "@/components/applications/application-format";
import { IconTile } from "@/components/applications/icon-tile";
import { TimelineSection } from "@/components/timeline/timeline-section";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { SelectOptions } from "@/options";
import { useSupports } from "@/contexts/supports-context";
import { cn } from "@/lib/utils";
import type { Application } from "@/services/types/applications";

interface ApplicationItemProps {
  app: Application;
  onEditClick?: (app: Application) => void;
  onFinalizeClick?: (app: Application) => void;
  onDeleteClick?: (app: Application) => void;
  onReopenClick?: (app: Application) => void;
  reopenPending?: boolean;
  /** Initial `isExpanded` (R-011, KODI-038 `?focus=`). Absent = today's behaviour (closed). */
  defaultExpanded?: boolean;
}

/** value -> label lookup, capitalising the raw value when the option list has
 * nothing (never happens for these two selects, but keeps the tile honest). */
function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Application row + inline expansion (PRD 0008, ADR 0012; KODI-015 reference
 * image). Owns the status pill and the Reopen affordance, both derived from
 * `app.finalized_at` (the single source of truth for "closed" — see
 * `TimelineSection`). A closed application hides Edit/Close and offers Reopen
 * instead; the CV link always stays, a closed application's CV copy is still
 * readable.
 *
 * Mounts `TimelineSection` directly in the expanded area.
 */
export function ApplicationItem({
  app,
  defaultExpanded,
  ...props
}: ApplicationItemProps) {
  const [isExpanded, setExpanded] = useState<boolean>(defaultExpanded ?? false);
  const { supports } = useSupports();
  const companyId = useId();

  if (!supports) return null;

  const isClosed = app.finalized_at != null;
  const name = applicationName(app.role, app.company_name);

  const getPlatformName = (id: string) =>
    supports.platforms.find((p) => p.id === id)?.name ?? String(id);

  /**
   * Divider visibility per tile, keyed by which tile it is (KODI-015
   * remediation): the five image tiles are always 1-column; Salary Range and
   * Expected Salary span 2; Notes spans the full row. A "full" span is
   * passed as `columns` itself so the packing simulation always starts and
   * fills its own row for it, at either breakpoint. Built as one pure lookup
   * (no mutation) so the tiles below — rendered as individual conditional
   * JSX blocks, not a `.map()` — can each read their own entry by key.
   */

  return (
    <Collapsible open={isExpanded} onOpenChange={setExpanded} asChild>
      <article
        aria-labelledby={companyId}
        className="@container/app-card rounded-xl border border-border bg-card shadow-card transition-shadow data-[state=open]:shadow-elevated"
      >
        <div
          onClick={() => setExpanded((current) => !current)}
          className="flex cursor-pointer items-start gap-4 p-4 sm:gap-5 sm:px-5 sm:py-3.5 @4xl/app-card:items-center"
        >
          <IconTile
            icon={Building2}
            tone="primary"
            className="max-sm:size-10 max-sm:[&_svg]:size-5"
          />

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-full @4xl/app-card:basis-0">
              <p
                id={companyId}
                className="truncate font-display text-base font-semibold text-foreground"
              >
                {app.company_name}
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{app.role}</span>
                {app.experience_level ? (
                  <>
                    <span aria-hidden>•</span>
                    <span className="shrink-0">
                      {optionLabel(
                        SelectOptions.SENIORITY,
                        app.experience_level,
                      )}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2 font-numeric text-sm text-muted-foreground">
                <Calendar aria-hidden className="size-4" />
                <time dateTime={app.application_date}>
                  {app.application_date}
                </time>
              </span>
              <ApplicationStatusPill
                label={
                  isClosed ? APPLICATION_CLOSED_LABEL : APPLICATION_ACTIVE_LABEL
                }
                tone={isClosed ? "neutral" : "success"}
              />
            </div>

            <Separator
              orientation="vertical"
              className="hidden data-[orientation=vertical]:h-8 @4xl/app-card:block"
            />

            <div
              onClick={(e) => e.stopPropagation()}
              className="ml-auto flex items-center gap-1 sm:gap-2"
            >
              {isClosed ? (
                props.onReopenClick && (
                  <ApplicationReopenButton
                    onReopen={() => props.onReopenClick!(app)}
                    pending={props.reopenPending}
                    applicationName={name}
                  />
                )
              ) : (
                <>
                  {props.onEditClick && (
                    <ApplicationIconAction
                      icon={SquarePen}
                      label={`${APPLICATION_ACTION_COPY.edit} ${name}`}
                      title={APPLICATION_ACTION_COPY.edit}
                      onClick={() => props.onEditClick!(app)}
                    />
                  )}
                  {props.onFinalizeClick && (
                    <ApplicationIconAction
                      icon={Flag}
                      label={`${CLOSE_ACTION_LABEL} ${name}`}
                      title={CLOSE_ACTION_LABEL}
                      tone="warning"
                      onClick={() => props.onFinalizeClick!(app)}
                    />
                  )}
                </>
              )}

              {/*
                Outside the closed guard on purpose: a finalized application's
                CV copy is still readable, so its link stays.
              */}
              <ApplicationIconAction
                icon={FileText}
                href={`/applications/cv?id=${app.id}`}
                label={`${APPLICATION_ACTION_COPY.cv} for ${name}`}
                title={APPLICATION_ACTION_COPY.cv}
              />

              {/*
                Outside the closed guard too: the API allows deleting a closed
                application (only an ARCHIVED one is refused).
              */}
              {props.onDeleteClick && (
                <ApplicationIconAction
                  icon={Trash2}
                  label={`${APPLICATION_ACTION_COPY.delete} ${name}`}
                  title={APPLICATION_ACTION_COPY.delete}
                  tone="destructive"
                  onClick={() => props.onDeleteClick!(app)}
                />
              )}
            </div>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`${APPLICATION_ACTION_COPY.details} for ${name}`}
                data-slot="application-item-details-trigger"
                className={cn(
                  "shrink-0 text-muted-foreground hover:text-foreground",
                  "[&_svg:not([class*='size-'])]:size-5",
                  "[&>svg]:transition-transform motion-reduce:[&>svg]:transition-none [&[data-state=open]>svg]:rotate-180",
                )}
              >
                <ChevronDown aria-hidden />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="flex animate-fade-in-up flex-col gap-4 px-4 pb-4 motion-reduce:animate-none sm:px-5 sm:pb-5">
          <ApplicationDetailsPanel>
            <ApplicationDetailTile
              icon={Building2}
              label={APPLICATION_DETAIL_LABELS.platform}
              tone="primary"
            >
              {getPlatformName(app.platform_id)}
            </ApplicationDetailTile>
            <ApplicationDetailTile
              icon={CircleCheck}
              label={APPLICATION_DETAIL_LABELS.source}
              tone="success"
            >
              {app.mode === "active" ? "Active" : "Passive"}
            </ApplicationDetailTile>
            <ApplicationDetailTile
              icon={Calendar}
              label={APPLICATION_DETAIL_LABELS.date}
              tone="neutral"
            >
              {app.application_date}
            </ApplicationDetailTile>
            {app.experience_level ? (
              <ApplicationDetailTile
                icon={GraduationCap}
                label={APPLICATION_DETAIL_LABELS.experience}
                tone="info"
              >
                {optionLabel(SelectOptions.SENIORITY, app.experience_level)}
              </ApplicationDetailTile>
            ) : null}
            {app.work_mode ? (
              <ApplicationDetailTile
                icon={Wifi}
                label={APPLICATION_DETAIL_LABELS.workMode}
                tone="info"
              >
                {optionLabel(SelectOptions.WORK_MODE, app.work_mode)}
              </ApplicationDetailTile>
            ) : null}
            {app.link_to_job ? (
              <ApplicationDetailTile
                icon={ExternalLink}
                label={APPLICATION_DETAIL_LABELS.jobPosting}
              >
                <a
                  href={app.link_to_job}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {APPLICATION_DETAIL_LABELS.jobPostingLink}
                </a>
              </ApplicationDetailTile>
            ) : null}
            {app.country ? (
              <ApplicationDetailTile
                icon={MapPin}
                label={APPLICATION_DETAIL_LABELS.country}
              >
                {app.country}
              </ApplicationDetailTile>
            ) : null}
            {app.salary_range_min != null ? (
              <ApplicationDetailTile
                icon={Banknote}
                label={APPLICATION_DETAIL_LABELS.salaryRange}
              >
                <span className="font-numeric break-normal sm:whitespace-nowrap">
                  {formatSalary({
                    salaryRangeMin: app.salary_range_min?.toString(),
                    salaryRangeMax: app.salary_range_max?.toString(),
                    currency: app.currency,
                    salaryPeriod: app.salary_period,
                  })}
                </span>
              </ApplicationDetailTile>
            ) : null}
            {app.expected_salary != null ? (
              <ApplicationDetailTile
                icon={Wallet}
                label={APPLICATION_DETAIL_LABELS.expectedSalary}
              >
                <span className="font-numeric break-normal sm:whitespace-nowrap">
                  {formatSalary({
                    expectedSalary: app.expected_salary?.toString(),
                    currency: app.currency,
                    salaryPeriod: app.salary_period,
                  })}
                </span>
              </ApplicationDetailTile>
            ) : null}
            {app.observation ? (
              <ApplicationDetailTile
                icon={NotebookText}
                label={APPLICATION_DETAIL_LABELS.notes}
                wide
              >
                <span className="block text-sm leading-relaxed font-normal whitespace-pre-wrap text-foreground/90">
                  {app.observation}
                </span>
              </ApplicationDetailTile>
            ) : null}
          </ApplicationDetailsPanel>

          <TimelineSection application={app} />
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

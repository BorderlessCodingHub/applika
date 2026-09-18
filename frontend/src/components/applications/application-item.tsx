"use client";

import type { Application } from "@/services/types/applications";
import { ApplicationClosedBadge } from "@/components/applications/application-closed-badge";
import { CLOSE_ACTION_LABEL } from "@/components/applications/application-close-copy";
import { ApplicationReopenButton } from "@/components/applications/application-reopen-button";
import { TimelineSection } from "@/components/timeline/timeline-section";
import { Badge } from "@/components/ui/badge";
import { useSupports } from "@/contexts/supports-context";
import { cn } from "@/lib/utils";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Dot,
  Edit,
  ExternalLink,
  FileText,
  Flag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { formatSalary } from "@/options";
import { Button, LinkButton } from "../ui/button";

interface ApplicationItemProps {
  app: Application;
  onEditClick?: (app: Application) => void;
  onFinalizeClick?: (app: Application) => void;
  onDeleteClick?: (app: Application) => void;
  onReopenClick?: (app: Application) => void;
  reopenPending?: boolean;
}

/**
 * Application row + inline expansion (PRD 0008, ADR 0012). Owns the closed
 * badge and the Reopen affordance, both derived from `app.finalized_at`
 * (the single source of truth for "closed" — see `TimelineSection`). A closed
 * application hides Add/Edit/Close and offers Reopen instead; the CV link
 * always stays, a closed application's CV copy is still readable.
 *
 * Mounts `TimelineSection` directly in the expanded area — it used to take the
 * steps block as `children` (`ApplicationStepTimeline`, now removed with the
 * step/feedback catalogs, R-021); the timeline owns its own data and its own
 * read-only guard, so nothing needs to be threaded in from here beyond `app`.
 */
export function ApplicationItem({ app, ...props }: ApplicationItemProps) {
  const [isExpanded, setExpanded] = useState<boolean>(false);
  const { supports } = useSupports();

  if (!supports) return null;

  const isClosed = app.finalized_at != null;
  const applicationName = `${app.role} at ${app.company_name}`;

  const getPlatformName = (id: string) =>
    supports.platforms.find((p) => p.id === id)?.name ?? String(id);

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border/60 bg-card shadow-card transition-all duration-200",
          isExpanded && "shadow-elevated",
        )}
        style={{ animationDelay: "30ms" }}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/40">
          {/* Company icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>

          {/* Main info */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-foreground">
              {app.company_name}
            </p>
            <div className="mt-0.5 flex items-center truncate text-sm text-muted-foreground">
              <span className="truncate">{app.role}</span>
              {app.experience_level && (
                <>
                  <Dot />
                  <span className="shrink-0 capitalize">
                    {app.experience_level.replace("_", " ")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status badges */}
          <div className="hidden items-center gap-2 lg:flex">
            <ApplicationClosedBadge finalizedAt={app.finalized_at} />
          </div>

          {/* Meta info */}
          <div className="hidden items-center gap-3 text-xs text-muted-foreground lg:flex">
            <div className="hidden items-center gap-1.5 font-numeric text-xs text-muted-foreground sm:flex">
              <Calendar className="h-3.5 w-3.5" />
              {app.application_date}
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {isClosed ? (
              props.onReopenClick && (
                <ApplicationReopenButton
                  onReopen={() => props.onReopenClick!(app)}
                  pending={props.reopenPending}
                  applicationName={applicationName}
                />
              )
            ) : (
              <>
                {props.onEditClick && (
                  <Button
                    size="sm"
                    variant="link"
                    onClick={() => props.onEditClick!(app)}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}

                {props.onFinalizeClick && (
                  <Button
                    size="sm"
                    variant="link"
                    onClick={() => props.onFinalizeClick!(app)}
                    className="gap-1.5 text-warning/80 hover:text-warning"
                    title={CLOSE_ACTION_LABEL}
                    aria-label={CLOSE_ACTION_LABEL}
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            {/*
              Outside the closed guard on purpose: a finalized application's CV
              copy is still readable, so its link stays.
            */}
            <LinkButton
              href={`/applications/cv?id=${app.id}`}
              size="sm"
              variant="link"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              title="CV"
              aria-label={`CV for ${app.role} at ${app.company_name}`}
            >
              <FileText className="h-4 w-4" />
            </LinkButton>

            {!isClosed && props.onDeleteClick && (
              <Button
                size="sm"
                variant="link"
                onClick={() => props.onDeleteClick!(app)}
                className="gap-1.5 text-destructive/80 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="link"
              onClick={() => setExpanded((current) => !current)}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile badges row */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-3 lg:hidden">
          <ApplicationClosedBadge finalizedAt={app.finalized_at} />

          {app.mode && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs capitalize"
            >
              {app.mode}
            </Badge>
          )}

          {app.work_mode && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs capitalize"
            >
              {app.work_mode.replace("_", " ")}
            </Badge>
          )}

          <Badge variant="secondary" className="px-2 py-0.5 text-xs capitalize">
            {app.company_name}
          </Badge>

          <span className="ml-auto font-numeric text-xs text-muted-foreground">
            {app.application_date}
          </span>
        </div>

        {/* Inline expansion */}
        {isExpanded && (
          <div
            className="animate-fade-in-up border-t border-border px-5 pt-1 pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {app.link_to_job && (
                <a
                  href={app.link_to_job}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View job posting
                </a>
              )}

              <div>
                <span className="text-muted-foreground">Platform</span>
                <p className="mt-0.5 font-medium text-foreground">
                  {getPlatformName(app.platform_id)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Source</span>
                <p className="mt-0.5 font-medium text-foreground">
                  {app.mode === "active" ? "Active" : "Passive"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Date</span>
                <p className="mt-0.5 font-numeric font-medium text-foreground">
                  {app.application_date}
                </p>
              </div>

              {app.experience_level && (
                <div>
                  <span className="text-muted-foreground">Experience</span>
                  <p className="mt-0.5 font-medium text-foreground capitalize">
                    {app.experience_level.replace("_", " ")}
                  </p>
                </div>
              )}
              {app.work_mode && (
                <div>
                  <span className="text-muted-foreground">Work Mode</span>
                  <p className="mt-0.5 font-medium text-foreground capitalize">
                    {app.work_mode.replace("_", " ")}
                  </p>
                </div>
              )}
              {app.country && (
                <div>
                  <span className="text-muted-foreground">Country</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {app.country}
                  </p>
                </div>
              )}
              {app.salary_range_min != null && (
                <div>
                  <span className="text-muted-foreground">Salary Range</span>
                  <p className="mt-0.5 font-numeric font-medium text-foreground">
                    {formatSalary(app.salary_range_min, app.currency)}
                    {" – "}
                    {formatSalary(
                      app.salary_range_max,
                      app.currency,
                      app.salary_period,
                    )}
                  </p>
                </div>
              )}
              {app.expected_salary != null && (
                <div>
                  <span className="text-muted-foreground">Expected Salary</span>
                  <p className="mt-0.5 font-numeric font-medium text-foreground">
                    {formatSalary(
                      app.expected_salary,
                      app.currency,
                      app.salary_period,
                    )}
                  </p>
                </div>
              )}
              {app.observation && (
                <div className="col-span-full">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {app.observation}
                  </p>
                </div>
              )}
            </div>

            <TimelineSection application={app} className="mt-4 shadow-none" />
          </div>
        )}
      </div>
    </>
  );
}

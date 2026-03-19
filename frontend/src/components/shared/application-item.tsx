"use client";

import type {
  Application,
  ApplicationStep,
} from "@/services/types/applications";
import type { Step } from "@/services/types/supports";
import { useApplicationSteps } from "@/hooks/use-application-steps";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupports } from "@/contexts/supports-context";
import { cn } from "@/lib/utils";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Dot,
  Edit,
  ExternalLink,
  Flag,
  ListPlus,
  Pencil,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApplicationItemProps {
  app: Application;
  onNewStepClick: (app: Application) => void;
  onEditClick: (app: Application) => void;
  onFinalizeClick: (app: Application) => void;
  onDeleteClick: (app: Application) => void;
  children: React.ReactNode;
}

export function ApplicationItem({ children, ...props }: ApplicationItemProps) {
  const [isExpanded, setExpanded] = useState<boolean>(false);
  const { supports } = useSupports();

  if (!supports) return null;

  const getPlatformName = (id: string) =>
    supports.platforms.find((p) => p.id === id)?.name ?? String(id);

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border/60 bg-card shadow-card transition-all duration-200",
          isExpanded && "shadow-elevated"
        )}
        style={{ animationDelay: "30ms" }}
      >
        <div className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/40">
          {/* Company icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>

          {/* Main info */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-foreground">
              {props.app.company.name}
            </p>
            <div className="mt-0.5 flex items-center truncate text-sm text-muted-foreground">
              <span className="truncate">{props.app.role}</span>
              {props.app.experience_level && (
                <>
                  <Dot />
                  <span className="shrink-0 capitalize">
                    {props.app.experience_level.replace("_", " ")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status badges */}
          <div className="hidden items-center gap-2 lg:flex">
            {props.app.last_step && (
              <Badge
                variant="outline"
                className="gap-1.5 px-2.5 py-1 text-xs font-medium"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: props.app.last_step.color }}
                />
                {props.app.last_step.name}
              </Badge>
            )}
            {props.app.feedback && (
              <div className="hidden xl:block">
                <Badge
                  variant="outline"
                  className="gap-1.5 px-2.5 py-1 text-xs font-medium"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: props.app.feedback.color }}
                  />
                  {props.app.feedback.name}
                </Badge>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="hidden items-center gap-3 text-xs text-muted-foreground lg:flex">
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              <span className="capitalize">{props.app.mode}</span>
            </span>
            <span className="text-border">|</span>

            <div className="hidden items-center gap-1.5 text-xs tabular-nums text-muted-foreground sm:flex">
              <Calendar className="h-3.5 w-3.5" />
              {props.app.application_date}
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!props.app.finalized && (
              <>
                <button
                  onClick={() => props.onNewStepClick(props.app)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Add step"
                >
                  <ListPlus className="h-4 w-4" />
                </button>

                <button
                  onClick={() => props.onEditClick(props.app)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>

                <button
                  onClick={() => props.onFinalizeClick(props.app)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Finalize"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              onClick={() => props.onDeleteClick(props.app)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setExpanded((current) => !current)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile badges row */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-3 lg:hidden">
          {props.app.mode && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs capitalize"
            >
              {props.app.mode}
            </Badge>
          )}

          {props.app.work_mode && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs capitalize"
            >
              {props.app.work_mode.replace("_", " ")}
            </Badge>
          )}

          {props.app.company && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs capitalize"
            >
              {props.app.company.name}
            </Badge>
          )}

          {props.app.last_step && (
            <Badge
              variant="outline"
              className="gap-1.5 px-2 py-0.5 text-xs font-medium"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: props.app.last_step.color }}
              />
              {props.app.last_step.name}
            </Badge>
          )}

          {props.app.feedback && (
            <Badge
              variant="outline"
              className="gap-1.5 px-2 py-0.5 text-xs font-medium"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: props.app.feedback.color }}
              />
              {props.app.feedback.name}
            </Badge>
          )}

          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {props.app.application_date}
          </span>
        </div>

        {/* Inline expansion */}
        {isExpanded && (
          <div className="animate-fade-in-up border-t border-border px-5 pb-5 pt-1">
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {props.app.link_to_job && (
                <a
                  href={props.app.link_to_job}
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
                  {getPlatformName(props.app.platform_id)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Source</span>
                <p className="mt-0.5 font-medium text-foreground">
                  {props.app.mode === "active" ? "Active" : "Passive"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Date</span>
                <p className="mt-0.5 font-medium tabular-nums text-foreground">
                  {props.app.application_date}
                </p>
              </div>

              {props.app.experience_level && (
                <div>
                  <span className="text-muted-foreground">Experience</span>
                  <p className="mt-0.5 font-medium capitalize text-foreground">
                    {props.app.experience_level.replace("_", " ")}
                  </p>
                </div>
              )}
              {props.app.work_mode && (
                <div>
                  <span className="text-muted-foreground">Work Mode</span>
                  <p className="mt-0.5 font-medium capitalize text-foreground">
                    {props.app.work_mode.replace("_", " ")}
                  </p>
                </div>
              )}
              {props.app.country && (
                <div>
                  <span className="text-muted-foreground">Country</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {props.app.country}
                  </p>
                </div>
              )}
              {props.app.salary_range_min != null && (
                <div>
                  <span className="text-muted-foreground">Salary Range</span>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground">
                    {formatSalaryConcise(
                      props.app.salary_range_min,
                      props.app.currency
                    )}{" "}
                    –{" "}
                    {formatSalaryConcise(
                      props.app.salary_range_max,
                      props.app.currency,
                      props.app.salary_period
                    )}
                  </p>
                </div>
              )}
              {props.app.expected_salary != null && (
                <div>
                  <span className="text-muted-foreground">Expected Salary</span>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground">
                    {formatSalaryConcise(
                      props.app.expected_salary,
                      props.app.currency,
                      props.app.salary_period
                    )}
                  </p>
                </div>
              )}
              {props.app.observation && (
                <div className="col-span-full">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {props.app.observation}
                  </p>
                </div>
              )}
            </div>

            {/* Steps timeline */}
            {isExpanded && <>{children}</>}
          </div>
        )}
      </div>
    </>
  );
}

function getRelativeTimeLabel(dateStr: string) {
  const stepDate = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - stepDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: diffDays === -1 ? "Tomorrow" : `In ${Math.abs(diffDays)} days`,
      isFuture: true,
    };
  } else if (diffDays === 0) {
    return { label: "Today", isFuture: false };
  } else if (diffDays === 1) {
    return { label: "Yesterday", isFuture: false };
  } else if (diffDays < 7) {
    return { label: `${diffDays} days ago`, isFuture: false };
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return {
      label: weeks === 1 ? "1 week ago" : `${weeks} weeks ago`,
      isFuture: false,
    };
  } else {
    const months = Math.floor(diffDays / 30);
    return {
      label: months === 1 ? "1 month ago" : `${months} months ago`,
      isFuture: false,
    };
  }
}

interface StepDelete {
  open: boolean;
  id?: string;
}

export function ApplicationStepTimeline({
  id,
  isDisabled,
  stepsSupports,
  onEditStep,
}: {
  id: string;
  isDisabled?: boolean;
  stepsSupports: Step[];
  onEditStep?: (step: ApplicationStep) => void;
}) {
  const [stepDelete, setStepDelete] = useState<StepDelete>({ open: false });

  const {
    steps,
    isLoading: stepsLoading,
    deleteMutation,
  } = useApplicationSteps(id);

  const resolveStep = (stepId: string) =>
    stepsSupports.find((s) => s.id === stepId);

  if (stepsLoading)
    return (
      <div className="mt-4 border-t border-border/50 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Steps
        </span>
        <div className="mt-3 space-y-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Steps
        </span>
        <span className="text-xs text-muted-foreground">
          {steps.length} recorded
        </span>
      </div>

      {steps.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No steps recorded yet.
        </p>
      ) : (
        <div className="relative mt-3 space-y-0">
          {/* Vertical timeline line */}
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />

          {steps.map((step) => {
            const supportStep = resolveStep(step.step_id);
            const stepName = supportStep?.name ?? `Step #${step.step_id}`;
            const stepColor = supportStep?.color ?? "#888888";
            const { label: timeLabel, isFuture } = getRelativeTimeLabel(
              step.step_date
            );

            return (
              <div
                key={step.id}
                className="group relative flex gap-3 pb-4 last:pb-0"
              >
                {/* Timeline dot */}
                <div
                  className={cn(
                    "relative right-0.5 z-10 mt-4 h-5 w-5 shrink-0 rounded-full border-2 bg-background",
                    isFuture && "border-dashed"
                  )}
                  style={{ borderColor: stepColor }}
                >
                  <div
                    className="absolute inset-1 rounded-full"
                    style={{ backgroundColor: stepColor }}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 rounded-lg border border-border/50 bg-accent/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1.5 px-2.5 py-1 text-xs font-semibold"
                      style={{
                        borderColor: stepColor,
                        color: stepColor,
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: stepColor }}
                      />
                      {stepName}
                    </Badge>

                    {/* Actions */}
                    {!isDisabled && (
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => onEditStep?.(step)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Edit step"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() =>
                            setStepDelete({ open: true, id: step.id })
                          }
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete step"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Date row */}
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-foreground/70">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums">{step.step_date}</span>
                    <span className="text-border">·</span>
                    <span
                      className={cn(isFuture && "font-medium text-primary")}
                    >
                      {timeLabel}
                    </span>
                  </div>

                  {/* Observation */}
                  {step.observation && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground/70">
                      {step.observation}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={stepDelete.open}
        onOpenChange={(open) => setStepDelete({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete step?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                stepDelete.id && deleteMutation.mutate(stepDelete.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  BRL: "R$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CHF: "CHF",
  INR: "₹",
};
const PERIOD_SUFFIXES: Record<string, string> = {
  hourly: "/hr",
  monthly: "/mo",
  annual: "/yr",
};

function formatSalaryConcise(
  value: number | undefined | null,
  currency?: string,
  period?: string
) {
  if (value == null) return "";
  const sym = CURRENCY_SYMBOLS[currency ?? "USD"] ?? currency ?? "$";
  const suf = period ? (PERIOD_SUFFIXES[period] ?? "") : "";
  return `${sym}${value.toLocaleString()}${suf}`;
}

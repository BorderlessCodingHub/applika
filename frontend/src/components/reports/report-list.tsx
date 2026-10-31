"use client";

import { Eye, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReports } from "@/hooks/use-repports";
import { useCycleContext } from "@/contexts/cycle-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportStatusBadge } from "./status-badge";
import type { ReportDay, ReportDaysType } from "@/services/types/reports";
import { cn } from "@/lib/utils";

// Phase mapping: day → phase number
const LIST_PHASE: Record<ReportDaysType, 1 | 2 | 3 | 4> = {
  1: 1,
  14: 1,
  28: 1,
  42: 2,
  56: 2,
  70: 3,
  84: 3,
  98: 4,
  112: 4,
  120: 4,
};

interface ReportsListProps {
  onFillReport: (day: ReportDaysType) => void;
  onViewReport: (day: ReportDaysType) => void;
}

function ListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="h-0.5 flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function getEffectiveStatus(
  report: ReportDay,
  currentDay: number,
): ReportDay["status"] {
  if (report.status === "overdue" && currentDay <= report.day + 14) {
    return "pending";
  }
  return report.status;
}

function ReportRow({
  report,
  currentDay,
  onFill,
  onView,
}: {
  report: ReportDay;
  currentDay: number;
  onFill?: () => void;
  onView?: () => void;
}) {
  const t = useTranslations("reports.list");
  const phase = LIST_PHASE[report.day] ?? 1;
  const effectiveStatus = getEffectiveStatus(report, currentDay);
  const isSubmitted = effectiveStatus === "submitted";
  const isFuture = effectiveStatus === "future";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 transition-opacity",
        isFuture && "opacity-50",
      )}
    >
      {/* Day number badge */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-numeric text-sm font-semibold",
          isSubmitted
            ? "bg-emerald-500/15 text-emerald-400"
            : isFuture
              ? "bg-secondary text-muted-foreground"
              : "bg-primary/15 text-primary",
        )}
      >
        {report.day}
      </div>

      {/* Label */}
      <div className="min-w-0 flex-1 basis-20">
        <p className="text-sm leading-tight font-semibold">
          {t("day", { day: report.day })}
        </p>
        <p className="text-xs text-muted-foreground">{t("phase", { phase })}</p>
      </div>

      {/* Status */}
      <ReportStatusBadge status={effectiveStatus} />

      {/* Action */}
      <div className="ml-auto shrink-0 sm:ml-2">
        {isSubmitted ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onView}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("view")}
          </Button>
        ) : onFill ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onFill}
            className="gap-1.5 border-primary/40 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("fill")}
          </Button>
        ) : (
          <span className="pr-2 text-xs text-muted-foreground">
            {t("notAvailable")}
          </span>
        )}
      </div>
    </div>
  );
}

export function ReportsList({ onFillReport, onViewReport }: ReportsListProps) {
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();
  const { reports, currentDay, isLoading } = useReports(selectedCycleId);
  const t = useTranslations("reports.list");
  const status = useTranslations("reports.status");

  if (isLoading) return <ListSkeleton />;

  const active = reports.filter(
    (r) => r.status === "pending" || r.status === "overdue",
  );
  const submitted = reports.filter((r) => r.status === "submitted");
  const upcoming = reports.filter((r) => r.status === "future");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t.rich("title", {
              accent: (chunks) => (
                <span className="text-primary">{chunks}</span>
              ),
            })}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t.rich("progress", {
              day: currentDay,
              em: (chunks) => (
                <span className="font-semibold text-primary">{chunks}</span>
              ),
            })}
          </p>
        </div>

        {/* Legend */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 self-start text-xs text-muted-foreground sm:pt-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {status("submitted")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            {status("pending")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            {status("overdue")}
          </span>
        </div>
      </div>

      {/* Tip — visible right below the header */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
        <span className="mt-px shrink-0 text-xs font-bold tracking-wider text-primary uppercase">
          {t("tip")}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t.rich("tipBody", {
            strong: (chunks) => (
              <span className="font-semibold text-foreground">{chunks}</span>
            ),
          })}
        </p>
      </div>

      {/* Active: pending + overdue */}
      {active.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label={t("current")} count={active.length} />
          {active.map((report) => (
            <ReportRow
              key={report.day}
              report={report}
              currentDay={currentDay}
              onFill={
                isViewingPastCycle
                  ? undefined
                  : () => onFillReport(report.day as ReportDaysType)
              }
            />
          ))}
        </div>
      )}

      {/* Submitted */}
      {submitted.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label={t("submitted")} count={submitted.length} />
          {submitted.map((report) => (
            <ReportRow
              key={report.day}
              report={report}
              currentDay={currentDay}
              onView={() => onViewReport(report.day as ReportDaysType)}
            />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <SectionLabel label={t("upcoming")} count={upcoming.length} />
          {upcoming.map((report) => (
            <ReportRow
              key={report.day}
              report={report}
              currentDay={currentDay}
            />
          ))}
        </div>
      )}
    </div>
  );
}

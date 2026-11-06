"use client";

import { useTranslations } from "next-intl";
import {
  ReportDays,
  ReportDaysType,
  ReportDetailResponse,
} from "@/services/types/reports";
import {
  Award,
  BarChart3,
  Bot,
  Briefcase,
  ChevronLeft,
  Flame,
  HelpCircle,
  Layers,
  Link2,
  Mic,
  Network,
  Percent,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Label } from "../ui/label";
import { SectionHeader, StatCard } from "./sub-components";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useFormatNumber } from "@/i18n/format-number";
import { useIntlLocale } from "@/i18n/intl-locale";

/**
 * The challenge's start day (`YYYY-MM-DD`): English keeps the ISO date it has
 * always shown; Portuguese writes `DD/MM/YYYY`. No `Date`, so no zone shift.
 */
export function formatReportDay(
  iso: string | null | undefined,
  intlLocale: string,
): string {
  if (!iso) return "—";
  if (intlLocale !== "pt-BR") return iso;
  const [year, month, day] = iso.substring(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

interface ReportReadOnlyProps {
  dayInterval: ReportDaysType;
  onCancel?: () => void;
  reportData: ReportDetailResponse;
}

export function ReportReadOnly({
  dayInterval,
  onCancel,
  reportData,
}: ReportReadOnlyProps) {
  const metrics = reportData.metrics;
  const manualMetrics = reportData.manual_metrics;
  const reportPhase = reportData.report?.phase ?? 1;
  const t = useTranslations("reports.detail");
  const formatNumber = useFormatNumber();
  const intlLocale = useIntlLocale();

  return (
    <div className="max-w-7xl space-y-4 py-2">
      {/* Header */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={onCancel}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("back")}
        </button>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("heading", { day: dayInterval, total: ReportDays.at(-1) ?? 0 })}
        </h1>
        <span className="text-sm font-medium text-primary">
          {t("phase", { phase: reportPhase })}
        </span>
      </div>

      {/* ── Auto-Calculated Metrics ─────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader
            icon={Bot}
            title={t("autoTitle")}
            description={t("autoDescription")}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Briefcase}
              label={t("applications")}
              value={metrics?.applications_count ?? 0}
            />
            <StatCard
              icon={Users}
              label={t("interviewsDone")}
              value={metrics?.interviews_completed_fortnight ?? 0}
            />
            <StatCard
              icon={Award}
              label={t("offers")}
              value={metrics?.offers_count ?? 0}
            />
            <StatCard
              icon={TrendingUp}
              label={t("activeProcesses")}
              value={metrics?.active_processes_count ?? 0}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Manual Metrics ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Target} title={t("manualTitle")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="mb-1.5 block">{t("startDate")}</Label>
              <Input
                className="bg-secondary/40 disabled:opacity-100"
                disabled
                value={formatReportDay(
                  reportData.period?.start_date,
                  intlLocale,
                )}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                {t("mockInterviews")}
              </Label>
              <Input
                className="bg-secondary/40 disabled:opacity-100"
                disabled
                value={manualMetrics?.mock_interviews_count ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                {t("linkedinPosts")}
              </Label>
              <Input
                className="bg-secondary/40 disabled:opacity-100"
                disabled
                value={manualMetrics?.linkedin_posts_count ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                {t("strategicConnections")}
              </Label>
              <Input
                className="bg-secondary/40 disabled:opacity-100"
                disabled
                value={manualMetrics?.strategic_connections_count ?? "—"}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Reflection ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader
            icon={Flame}
            title={t("reflection")}
            iconClass="text-amber-500 dark:text-amber-400"
          />
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                {t("biggestWin")}
              </Label>
              <Textarea
                className="resize-none bg-secondary/40 disabled:opacity-100"
                disabled
                value={manualMetrics?.biggest_win ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                {t("biggestChallenge")}
              </Label>
              <Textarea
                className="resize-none bg-secondary/40 disabled:opacity-100"
                disabled
                value={manualMetrics?.biggest_challenge ?? "—"}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Accumulated Totals ───────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={BarChart3} title={t("totalsTitle")} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Briefcase}
              label={t("totalApplications")}
              value={metrics?.total_applications_count ?? 0}
            />
            <StatCard
              icon={Users}
              label={t("totalScreenings")}
              value={metrics?.total_initial_screenings_count ?? 0}
            />
            <StatCard
              icon={Percent}
              label={t("callbackRate")}
              value={`${formatNumber((metrics?.callback_rate ?? 0) * 100, 1)}%`}
            />
            <StatCard
              icon={Layers}
              label={t("offerRate")}
              value={`${formatNumber((metrics?.offer_rate ?? 0) * 100, 1)}%`}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Next Fortnight Goal ──────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Target} title={t("goalTitle")} />
          <p className="-mt-2 mb-4 text-xs text-muted-foreground">
            {t.rich("goalPrompt", {
              strong: (chunks) => (
                <span className="font-semibold text-primary">{chunks}</span>
              ),
            })}
          </p>
          <Textarea
            className="resize-none bg-secondary/40 disabled:opacity-100"
            disabled
            value={manualMetrics?.next_fortnight_goal ?? "—"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

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

  return (
    <div className="max-w-6xl space-y-4 py-2">
      {/* Header */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Reports
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Report — Day {dayInterval} of {ReportDays.at(-1)}
        </h1>
        <span className="text-sm font-medium text-primary">
          Phase {reportPhase}
        </span>
      </div>

      {/* ── Auto-Calculated Metrics ─────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader
            icon={Bot}
            title="Auto-Calculated Metrics"
            description="These metrics are automatically calculated from your application data."
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Briefcase}
              label="Applications"
              value={metrics?.applications_count ?? 0}
            />
            <StatCard
              icon={Users}
              label="Interviews Done"
              value={metrics?.interviews_completed_fortnight ?? 0}
            />
            <StatCard
              icon={Award}
              label="Offers"
              value={metrics?.offers_count ?? 0}
            />
            <StatCard
              icon={TrendingUp}
              label="Active Processes"
              value={metrics?.active_processes_count ?? 0}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Manual Metrics ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Target} title="Manual Metrics" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="mb-1.5 block">Challenge Start Date</Label>
              <Input
                className="disabled:opacity-100 bg-secondary/40"
                disabled
                value={reportData.period?.start_date ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                Mock Interviews
              </Label>
              <Input
                className="disabled:opacity-100 bg-secondary/40"
                disabled
                value={manualMetrics?.mock_interviews_count ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                LinkedIn Posts
              </Label>
              <Input
                className="disabled:opacity-100 bg-secondary/40"
                disabled
                value={manualMetrics?.linkedin_posts_count ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                Strategic Connections
              </Label>
              <Input
                className="disabled:opacity-100 bg-secondary/40"
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
            title="Reflection"
            iconClass="text-amber-500 dark:text-amber-400"
          />
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Biggest Win
              </Label>
              <Textarea
                className="disabled:opacity-100 bg-secondary/40 resize-none"
                disabled
                value={manualMetrics?.biggest_win ?? "—"}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                Biggest Challenge
              </Label>
              <Textarea
                className="disabled:opacity-100 bg-secondary/40 resize-none"
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
          <SectionHeader icon={BarChart3} title="Accumulated Totals" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Briefcase}
              label="Total Applications"
              value={metrics?.total_applications_count ?? 0}
            />
            <StatCard
              icon={Users}
              label="Total Initial Screenings"
              value={metrics?.total_initial_screenings_count ?? 0}
            />
            <StatCard
              icon={Percent}
              label="Callback Rate"
              value={`${((metrics?.callback_rate ?? 0) * 100).toFixed(1)}%`}
            />
            <StatCard
              icon={Layers}
              label="Offer Rate"
              value={`${((metrics?.offer_rate ?? 0) * 100).toFixed(1)}%`}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Next Fortnight Goal ──────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Target} title="Next Fortnight Goal" />
          <p className="text-xs text-muted-foreground -mt-2 mb-4">
            What do you want to achieve in the next{" "}
            <span className="font-semibold text-primary">14 days</span>?
          </p>
          <Textarea
            className="disabled:opacity-100 bg-secondary/40 resize-none"
            disabled
            value={manualMetrics?.next_fortnight_goal ?? "—"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

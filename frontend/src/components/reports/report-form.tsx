"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useReportSubmit } from "@/hooks/use-repports";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ReportDays,
  ReportDetailResponse,
  type ReportDaysType,
} from "@/services/types/reports";
import {
  reportZodSchema,
  ReportFormType,
  WIN_MAX,
  CHALLENGE_MAX,
  GOAL_MAX,
} from "./report-form-config";
import {
  CharCounter,
  FieldError,
  SectionHeader,
  StatCard,
} from "./sub-components";

interface ReportFormProps {
  dayInterval: ReportDaysType;
  onCancel?: () => void;
  reportData: ReportDetailResponse;
  onStartDateChange: (string) => void;
}

function buildFormDefault(reportData: ReportDetailResponse): ReportFormType {
  const manualMetrics = reportData.manual_metrics;
  return {
    start_date: reportData.period.start_date,
    mock_interviews_count: manualMetrics?.mock_interviews_count ?? 0,
    linkedin_posts_count: manualMetrics?.linkedin_posts_count ?? 0,
    strategic_connections_count:
      manualMetrics?.strategic_connections_count ?? 0,
    biggest_win: manualMetrics?.biggest_win ?? "",
    biggest_challenge: manualMetrics?.biggest_challenge ?? "",
    next_fortnight_goal: manualMetrics?.next_fortnight_goal ?? "",
  };
}

export function ReportForm({
  dayInterval,
  onCancel,
  reportData,
  onStartDateChange,
}: ReportFormProps) {
  const form = useForm<ReportFormType>({
    resolver: zodResolver(reportZodSchema),
    defaultValues: buildFormDefault(reportData),
  });

  const { submit, isSubmitting } = useReportSubmit();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form;

  // Watched values for real-time character counting
  const startDate = useWatch({ control: control, name: "start_date" });
  const biggestWin = useWatch({ control, name: "biggest_win" }) ?? "";
  const biggestChallenge =
    useWatch({ control, name: "biggest_challenge" }) ?? "";
  const nextGoal = useWatch({ control, name: "next_fortnight_goal" }) ?? "";

  const metrics = reportData?.metrics;
  const phase = reportData?.report?.phase ?? 1;
  const canSubmit = reportData?.can_submit ?? true;

  const onSubmit = async (values: ReportFormType) => {
    await submit(dayInterval, {
      start_date: values.start_date,
      mock_interviews_count: values.mock_interviews_count,
      linkedin_posts_count: values.linkedin_posts_count,
      strategic_connections_count: values.strategic_connections_count,
      biggest_win: values.biggest_win,
      biggest_challenge: values.biggest_challenge,
      next_fortnight_goal: values.next_fortnight_goal,
    });
    onCancel?.();
  };

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
        <span className="text-sm font-medium text-primary">Phase {phase}</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              {/* Challenge Start Date */}
              <div>
                <Label className="mb-1.5 block">Challenge Start Date</Label>
                <DatePickerInput
                  value={startDate || undefined}
                  disabled={!canSubmit || dayInterval > 1}
                  onChange={(date) => {
                    onStartDateChange(date);
                    setValue("start_date", date ?? "", {
                      shouldValidate: true,
                    });
                  }}
                  maxDate={new Date()}
                  placeholder="Pick a date"
                  className={cn(
                    errors.start_date &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
                <FieldError message={errors.start_date?.message} />
              </div>

              {/* 3 numeric inputs */}
              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                  Mock Interviews
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className={cn(
                    errors.mock_interviews_count &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  {...register("mock_interviews_count", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError message={errors.mock_interviews_count?.message} />
              </div>

              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  LinkedIn Posts
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className={cn(
                    errors.linkedin_posts_count &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  {...register("linkedin_posts_count", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError message={errors.linkedin_posts_count?.message} />
              </div>

              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  <Network className="h-3.5 w-3.5 text-muted-foreground" />
                  Strategic Connections
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className={cn(
                    errors.strategic_connections_count &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  {...register("strategic_connections_count", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  message={errors.strategic_connections_count?.message}
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
              {/* Biggest Win */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    Biggest Win
                  </Label>
                  <CharCounter count={biggestWin.length} max={WIN_MAX} />
                </div>
                <Textarea
                  placeholder="What was your biggest achievement this fortnight?"
                  className={cn(
                    "resize-none",
                    errors.biggest_win &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  {...register("biggest_win")}
                />
                <FieldError message={errors.biggest_win?.message} />
              </div>

              {/* Biggest Challenge */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                    Biggest Challenge
                  </Label>
                  <CharCounter
                    count={biggestChallenge.length}
                    max={CHALLENGE_MAX}
                  />
                </div>
                <Textarea
                  placeholder="What was the biggest challenge you faced?"
                  className={cn(
                    "resize-none",
                    errors.biggest_challenge &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  {...register("biggest_challenge")}
                />
                <FieldError message={errors.biggest_challenge?.message} />
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
            <div>
              <div className="flex justify-end mb-1.5">
                <CharCounter count={nextGoal.length} max={GOAL_MAX} />
              </div>
              <Textarea
                placeholder="Set a specific, measurable goal for the next fortnight..."
                className={cn(
                  "resize-none min-h-[100px]",
                  errors.next_fortnight_goal &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                {...register("next_fortnight_goal")}
              />
              <FieldError message={errors.next_fortnight_goal?.message} />
            </div>
          </CardContent>
        </Card>

        {/* ── Footer Actions ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </form>
    </div>
  );
}

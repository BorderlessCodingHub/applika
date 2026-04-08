import {
  AlertCircle,
  BarChart3,
  Bot,
  Briefcase,
  Lightbulb,
  MessageSquare,
  Percent,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import type { ReportManualMetrics } from "../../types/report.types";
import {
  NumberInput,
  ReadOnlyNumberField,
  ReadOnlyStatCard,
  ReadOnlyTextField,
  StatCard,
  TextareaField,
} from "./fields";
import type {
  EditSectionBaseProps,
  ReadonlySectionBaseProps,
  ReportFormRegister,
  ReportMetrics,
} from "./types";

interface AutoCalculatedMetricsSectionProps {
  metrics: ReportMetrics;
  readOnly?: boolean;
}

type ManualMetricsSectionProps =
  | ({
      mode: "edit";
      isDayOne: boolean;
      todayLocal: string;
      register: ReportFormRegister;
    } & EditSectionBaseProps)
  | {
      mode: "readonly";
      manualMetrics?: ReportManualMetrics;
    };

type ReflectionSectionProps =
  | ({
      mode: "edit";
    } & EditSectionBaseProps)
  | ({
      mode: "readonly";
    } & ReadonlySectionBaseProps);

interface TotalsSectionProps {
  metrics: ReportMetrics;
  readOnly?: boolean;
}

type GoalSectionProps =
  | ({
      mode: "edit";
    } & EditSectionBaseProps)
  | ({
      mode: "readonly";
    } & ReadonlySectionBaseProps);

export function AutoCalculatedMetricsSection({
  metrics,
  readOnly = false,
}: AutoCalculatedMetricsSectionProps) {
  const CardComponent = readOnly ? ReadOnlyStatCard : StatCard;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Bot size={20} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-white">Auto-Calculated Metrics</h2>
      </div>
      <p className={`text-sm mb-4 ${readOnly ? "text-gray-500" : "text-gray-400"}`}>
        These metrics {readOnly ? "were" : "are"} automatically calculated from
        your application data.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <CardComponent
          icon={Briefcase}
          label="Applications"
          value={metrics.applications_count}
        />
        <CardComponent
          icon={Users}
          label="Interviews Done"
          value={metrics.interviews_completed_fortnight}
        />
        <CardComponent icon={Target} label="Offers" value={metrics.offers_count} />
        <CardComponent
          icon={TrendingUp}
          label="Active Processes"
          value={metrics.active_processes_count}
        />
      </div>
    </section>
  );
}

export function ManualMetricsSection(props: ManualMetricsSectionProps) {
  if (props.mode === "readonly") {
    return (
      <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Target size={20} className="text-emerald-400/70" />
          <h2 className="text-lg font-semibold text-white">Manual Metrics</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ReadOnlyNumberField
            label="Mock Interviews"
            icon={Users}
            value={props.manualMetrics?.mock_interviews_count ?? 0}
          />
          <ReadOnlyNumberField
            label="LinkedIn Posts"
            icon={MessageSquare}
            value={props.manualMetrics?.linkedin_posts_count ?? 0}
          />
          <ReadOnlyNumberField
            label="Strategic Connections"
            icon={Users}
            value={props.manualMetrics?.strategic_connections_count ?? 0}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Target size={20} className="text-emerald-400" />
        <h2 className="text-lg font-semibold text-white">Manual Metrics</h2>
      </div>

      {props.isDayOne && (
        <div className="mb-4">
          <DateInput
            {...props.register("start_date")}
            label="Challenge Start Date"
            max={props.todayLocal}
            error={props.errors.start_date?.message}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumberInput
          label="Mock Interviews"
          icon={Users}
          value={props.values.mock_interviews_count}
          onChange={(value) => props.setValue("mock_interviews_count", value)}
          error={props.errors.mock_interviews_count?.message}
        />
        <NumberInput
          label="LinkedIn Posts"
          icon={MessageSquare}
          value={props.values.linkedin_posts_count}
          onChange={(value) => props.setValue("linkedin_posts_count", value)}
          error={props.errors.linkedin_posts_count?.message}
        />
        <NumberInput
          label="Strategic Connections"
          icon={Users}
          value={props.values.strategic_connections_count}
          onChange={(value) =>
            props.setValue("strategic_connections_count", value)
          }
          error={props.errors.strategic_connections_count?.message}
        />
      </div>
    </section>
  );
}

export function ReflectionSection(props: ReflectionSectionProps) {
  if (props.mode === "readonly") {
    return (
      <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Lightbulb size={20} className="text-yellow-400/70" />
          <h2 className="text-lg font-semibold text-white">Reflection</h2>
        </div>

        <div className="space-y-4">
          <ReadOnlyTextField
            label="Biggest Win"
            icon={TrendingUp}
            value={props.manualMetrics?.biggest_win ?? ""}
          />

          <ReadOnlyTextField
            label="Biggest Challenge"
            icon={AlertCircle}
            value={props.manualMetrics?.biggest_challenge ?? ""}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Lightbulb size={20} className="text-yellow-400" />
        <h2 className="text-lg font-semibold text-white">Reflection</h2>
      </div>

      <div className="space-y-4">
        <TextareaField
          label="Biggest Win"
          icon={TrendingUp}
          value={props.values.biggest_win}
          onChange={(value) => props.setValue("biggest_win", value)}
          maxLength={280}
          placeholder="What was your biggest achievement this fortnight?"
          error={props.errors.biggest_win?.message}
        />

        <TextareaField
          label="Biggest Challenge"
          icon={AlertCircle}
          value={props.values.biggest_challenge}
          onChange={(value) => props.setValue("biggest_challenge", value)}
          maxLength={280}
          placeholder="What was the biggest challenge you faced?"
          error={props.errors.biggest_challenge?.message}
        />
      </div>
    </section>
  );
}

export function TotalsSection({
  metrics,
  readOnly = false,
}: TotalsSectionProps) {
  const CardComponent = readOnly ? ReadOnlyStatCard : StatCard;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={20} className={readOnly ? "text-blue-400/70" : "text-blue-400"} />
        <h2 className="text-lg font-semibold text-white">Accumulated Totals</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CardComponent
          icon={Briefcase}
          label="Total Applications"
          value={metrics.total_applications_count}
        />
        <CardComponent
          icon={Users}
          label="Total Initial Screenings"
          value={metrics.total_initial_screenings_count}
        />
        <CardComponent
          icon={Percent}
          label="Callback Rate"
          value={metrics.callback_rate}
          suffix="%"
          isPercentage
        />
        <CardComponent
          icon={Percent}
          label="Offer Rate"
          value={metrics.offer_rate}
          suffix="%"
          isPercentage
        />
      </div>
    </section>
  );
}

export function GoalSection(props: GoalSectionProps) {
  if (props.mode === "readonly") {
    return (
      <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target size={20} className="text-purple-400/70" />
          <h2 className="text-lg font-semibold text-white">Next Fortnight Goal</h2>
        </div>

        <ReadOnlyTextField
          label="Goal for the next 14 days"
          icon={Target}
          value={props.manualMetrics?.next_fortnight_goal ?? ""}
        />
      </section>
    );
  }

  return (
    <section className="bg-gray-800/30 rounded-xl border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target size={20} className="text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Next Fortnight Goal</h2>
      </div>

      <TextareaField
        label="What do you want to achieve in the next 14 days?"
        icon={Target}
        value={props.values.next_fortnight_goal}
        onChange={(value) => props.setValue("next_fortnight_goal", value)}
        maxLength={500}
        placeholder="Set a specific, measurable goal for the next fortnight..."
        error={props.errors.next_fortnight_goal?.message}
      />
    </section>
  );
}

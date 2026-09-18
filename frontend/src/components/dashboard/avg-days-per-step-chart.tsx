"use client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";
import { useStepAvgDays } from "@/hooks/use-statistics";
import { Card } from "../ui/card";
import { CustomTooltip } from "./chart-styles";
import {
  EVENT_TYPE_CONFIG,
  TIMELINE_STAGES,
  stageLabel,
  stageShortLabel,
} from "@/components/timeline/timeline-options";
import type { StepAvgDays } from "@/services/types/statistics";

function renderInsideLabel(props: Record<string, unknown>) {
  const { x, y, width, height, value } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  };
  if (!value || height < 24) return null;
  return (
    <text
      x={x + width - 30}
      y={y + 13}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={16}
      fontWeight={700}
    >
      {value}
    </text>
  );
}

/**
 * Every stage's row for the chart (PRD 0008, ADR 0012, AC5). Always 9 rows in
 * `TIMELINE_STAGES` order. A stage the API omitted renders as 0 days, not as a
 * missing bar, so the 9 rows are always present.
 */
export function buildAvgDaysRows(rows: StepAvgDays[] | undefined) {
  return TIMELINE_STAGES.map((stage) => {
    const row = rows?.find(
      (r) =>
        r.event_type === stage.eventType &&
        r.interview_type === stage.interviewType,
    );
    return {
      shortLabel: stageShortLabel(stage.eventType, stage.interviewType),
      fullLabel: stageLabel(stage.eventType, stage.interviewType),
      average_days: row?.average_days ?? 0,
      color: EVENT_TYPE_CONFIG[stage.eventType].chartColor,
    };
  });
}

export function AvgDaysPerStepChart({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading } = useStepAvgDays(cycleId);
  const rows = buildAvgDaysRows(data);

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="pb-4">
        <h2 className="text-base">Avg Days / Stage</h2>
        <p className="text-xs text-muted-foreground">
          Average number of days spent in each stage before progressing
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-[280px] w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.5}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              stroke="none"
              padding={{ right: 30 }}
            />
            <YAxis
              dataKey="shortLabel"
              type="category"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              width={84}
              stroke="none"
            />
            <Tooltip
              content={<CustomTooltip />}
              labelFormatter={(_value, payload) =>
                (payload?.[0]?.payload as { fullLabel?: string } | undefined)
                  ?.fullLabel ?? ""
              }
              cursor={{
                fill: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
              }}
            />
            <Bar dataKey="average_days" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="average_days" content={renderInsideLabel} />

              {rows.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

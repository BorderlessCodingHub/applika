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
import { useStepConversion } from "@/hooks/use-statistics";
import { CustomTooltip } from "./chart-styles";
import { Card } from "../ui/card";
import {
  EVENT_TYPE_CONFIG,
  TIMELINE_STAGES,
  stageLabel,
  stageShortLabel,
} from "@/components/timeline/timeline-options";
import type { StepConversion } from "@/services/types/statistics";

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
      x={x + width / 2}
      y={y + 18}
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

function renderTopLabel(props: Record<string, unknown>) {
  const { x, y, width, value } = props as {
    x: number;
    y: number;
    width: number;
    value: number;
  };
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill="var(--muted-foreground)"
      textAnchor="middle"
      fontSize={14}
      fontWeight={500}
    >
      {value}%
    </text>
  );
}

/**
 * Every stage's row for the chart (PRD 0008, ADR 0012, AC5). Always 9 rows in
 * `TIMELINE_STAGES` order — an interview type, or offer/denied — never a
 * step-definition row. A stage the API omitted (0 applications) renders as 0,
 * not as a missing bar, so the 9 columns are always present.
 */
export function buildConversionRows(rows: StepConversion[] | undefined) {
  return TIMELINE_STAGES.map((stage) => {
    const row = rows?.find(
      (r) =>
        r.event_type === stage.eventType &&
        r.interview_type === stage.interviewType,
    );
    return {
      shortLabel: stageShortLabel(stage.eventType, stage.interviewType),
      fullLabel: stageLabel(stage.eventType, stage.interviewType),
      conversion_rate: row?.conversion_rate ?? 0,
      total_applications: row?.total_applications ?? 0,
      color: EVENT_TYPE_CONFIG[stage.eventType].chartColor,
    };
  });
}

export function StepConversionChart({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading } = useStepConversion(cycleId);
  const rows = buildConversionRows(data);

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="pb-4">
        <h2 className="text-base">Step Conversion</h2>
        <p className="text-xs text-muted-foreground">
          Percentage of applications that reached each stage
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-[240px] w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ bottom: 24 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="shortLabel"
              interval={0}
              angle={-35}
              textAnchor="end"
              height={56}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="none"
              padding={{ right: 20 }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              stroke="none"
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, (max: number) => Math.ceil((max + 10) / 10) * 10]}
            />
            <Tooltip
              content={<CustomTooltip sufix="%" />}
              labelFormatter={(_value, payload) =>
                (payload?.[0]?.payload as { fullLabel?: string } | undefined)
                  ?.fullLabel ?? ""
              }
              cursor={{
                fill: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
              }}
            />
            <Bar dataKey="conversion_rate" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="total_applications"
                content={renderInsideLabel}
              />
              <LabelList dataKey="conversion_rate" content={renderTopLabel} />
              {rows.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  style={{ transition: "fill-opacity 0.2s ease" }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

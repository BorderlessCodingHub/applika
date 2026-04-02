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
      fill="hsl(var(--muted-foreground))"
      textAnchor="middle"
      fontSize={14}
      fontWeight={500}
    >
      {value}%
    </text>
  );
}

export function StepConversionChart() {
  const { data, isLoading } = useStepConversion();

  return (
    <Card className="animate-fade-in-up p-5">
      <h2 className="pb-4 text-base">Step Conversion</h2>
      {isLoading ? (
        <Skeleton className="h-[240px] w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data ?? []}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="none"
              padding={{ right: 30 }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="none"
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, (max: number) => Math.ceil((max + 10) / 10) * 10]}
            />
            <Tooltip
              content={<CustomTooltip sufix="%" />}
              cursor={{ fill: "#8d8d8d12" }}
            />
            <Bar dataKey="conversion_rate" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="total_applications"
                content={renderInsideLabel}
              />
              <LabelList dataKey="conversion_rate" content={renderTopLabel} />
              {(data ?? []).map((entry, i) => (
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

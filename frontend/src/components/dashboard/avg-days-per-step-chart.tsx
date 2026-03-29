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

export function AvgDaysPerStepChart() {
  const { data, isLoading } = useStepAvgDays();

  return (
    <Card className="animate-fade-in-up p-5">
      <h2 className="pb-4 text-base">Avg Days / Step</h2>
      {isLoading ? (
        <Skeleton className="h-[240px] w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data ?? []} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="none"
              padding={{ right: 30 }}
            />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              width={80}
              stroke="none"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#8d8d8d12" }} />
            <Bar dataKey="average_days" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="average_days" content={renderInsideLabel} />

              {(data ?? []).map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

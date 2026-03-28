"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useModeStats } from "@/hooks/use-statistics";
import { CustomTooltip } from "./chart-styles";
import { Card } from "../ui/card";

const RADIAN = Math.PI / 180;

function renderOuterLabel(props: Record<string, unknown>) {
  const { cx, cy, midAngle, outerRadius, percent } = props as {
    cx: number;
    cy: number;
    midAngle: number;
    outerRadius: number;
    percent: number;
  };
  const radius = (outerRadius as number) + 18;
  const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
  const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--muted-foreground))"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fontWeight={500}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function renderInnerLabel(props: Record<string, unknown>) {
  const { cx, cy, midAngle, innerRadius, outerRadius, value } = props as {
    cx: number;
    cy: number;
    midAngle: number;
    innerRadius: number;
    outerRadius: number;
    value: number;
  };
  const radius = (innerRadius + outerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fontWeight={700}
    >
      {value}
    </text>
  );
}

export function ActiveVsPassiveChart() {
  const { data, isLoading } = useModeStats();

  const chartData = data
    ? [
        { name: "Active", value: data.active },
        { name: "Passive", value: data.passive },
      ]
    : [];

  return (
    <Card className="animate-fade-in-up p-5">
      <h2 className="pb-4 text-base">Active vs Passive</h2>
      {isLoading ? (
        <Skeleton className="h-[180px] w-full rounded-lg" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={72}
                paddingAngle={2}
                stroke="none"
                label={renderOuterLabel}
                labelLine={false}
              >
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--muted-foreground))" />
              </Pie>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={72}
                paddingAngle={2}
                stroke="none"
                label={renderInnerLabel}
                labelLine={false}
                isAnimationActive={false}
              >
                <Cell fill="transparent" />
                <Cell fill="transparent" />
              </Pie>
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "#8d8d8d12" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              Active
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
              Passive
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

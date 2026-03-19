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
} from "recharts";
import { useStepConversion } from "@/hooks/use-statistics";
import { CustomTooltip } from "./chart-styles";
import { Card } from "../ui/card";

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
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="conversion_rate" radius={[4, 4, 0, 0]}>
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

"use client";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useGeneralStats, useTrends } from "@/hooks/use-statistics";
import { CustomTooltip } from "./chart-styles";
import { RangeSlider } from "@/components/ui/range-slider";
import { Card } from "../ui/card";

export function ApplicationTrendChart() {
  const { data: trends, isLoading } = useTrends();
  const { data: stats } = useGeneralStats();

  const total = stats?.total_applications ?? 0;
  const prevTotal = total > 0 ? Math.round(total * 0.8) : 0;
  const trendPct =
    prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;

  const dataLength = trends?.length ?? 0;
  const [range, setRange] = useState<[number, number]>([0, 100]);

  const visibleData = useMemo(() => {
    if (!trends || trends.length === 0) return [];
    const startIdx = Math.round((range[0] / 100) * (trends.length - 1));
    const endIdx = Math.round((range[1] / 100) * (trends.length - 1));
    return trends.slice(startIdx, endIdx + 1);
  }, [trends, range]);

  const startLabel = visibleData[0]?.label ?? "";
  const endLabel = visibleData[visibleData.length - 1]?.label ?? "";
  const showRange = !isLoading && dataLength > 1 && startLabel !== endLabel;

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="pb-4 text-base">Application Trend</h2>
        {!isLoading && trendPct !== 0 && (
          <div className="flex items-center justify-center gap-1 text-primary">
            <TrendingUp className="h-5 w-5" />
            <span className="font-display text-base font-semibold">
              +{trendPct}%
            </span>
          </div>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-[280px] w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={visibleData}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.25}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="none"
              angle={-30}
              padding={{ right: 30 }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="none"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "#8d8d8d12" }}
            />
            <Area
              type="monotone"
              dataKey="total_applications"
              name="Total"
              label="Total applications"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={{ r: 2.5, fill: "hsl(var(--primary))", strokeWidth: 2 }}
              activeDot={{
                r: 4,
                fill: "hsl(var(--primary))",
                strokeWidth: 2,
                stroke: "hsl(var(--card))",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {isLoading ? (
        <Skeleton className="mt-4 h-6 w-full rounded-lg" />
      ) : dataLength > 1 ? (
        <div className="mt-4 pl-12 pr-6">
          <div className="">
            <RangeSlider
              min={0}
              max={100}
              step={1}
              value={range}
              onValueChange={(v) => setRange(v as [number, number])}
            />
          </div>
          {showRange && (
            <div className="mt-1.5 flex justify-between">
              <span className="text-sm text-primary">{startLabel}</span>
              <span className="text-sm text-primary">{endLabel}</span>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

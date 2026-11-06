"use client";
import { useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { formatNumber } from "@/i18n/format-number";
import type { TrendPoint } from "@/services/types/statistics";
import { CustomTooltip } from "./chart-styles";
import { RangeSlider } from "@/components/ui/range-slider";
import { Card } from "../ui/card";

/**
 * A day on the trend's axis: English keeps the API's `MM-DD`; Portuguese
 * writes `DD/MM`. Read from `application_date` (`YYYY-MM-DD`), no `Date`, so
 * no zone can shift the day.
 */
export function trendDayLabel(point: TrendPoint, locale: string): string {
  if (locale !== "pt-BR") return point.label;
  const [, month, day] = point.application_date.substring(0, 10).split("-");
  return month && day ? `${day}/${month}` : point.label;
}

export function ApplicationTrendChart({
  cycleId,
}: {
  cycleId?: string | null;
}) {
  const { data: trends, isLoading } = useTrends(cycleId);
  const t = useTranslations("dashboard.trend");
  const locale = useLocale();
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
    return trends
      .slice(startIdx, endIdx + 1)
      .map((point) => ({ ...point, label: trendDayLabel(point, locale) }));
  }, [trends, range, locale]);

  const startLabel = visibleData[0]?.label ?? "";
  const endLabel = visibleData[visibleData.length - 1]?.label ?? "";
  const showRange = !isLoading && dataLength > 1 && startLabel !== endLabel;

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {!isLoading && trendPct !== 0 && (
          <div className="flex items-center justify-center gap-1 text-primary">
            <TrendingUp className="h-5 w-5" />
            <span className="font-display text-base font-semibold">
              +{formatNumber(trendPct, locale)}%
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
                  stopColor="var(--chart-1)"
                  stopOpacity={0.25}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              stroke="none"
              angle={-30}
              padding={{ right: 30 }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              stroke="none"
              tickFormatter={(v: number) => formatNumber(v, locale)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                fill: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
              }}
            />
            <Area
              type="monotone"
              dataKey="total_applications"
              name={t("series")}
              label={t("seriesLabel")}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={{ r: 2.5, fill: "var(--chart-1)", strokeWidth: 2 }}
              activeDot={{
                r: 4,
                fill: "var(--chart-1)",
                strokeWidth: 2,
                stroke: "var(--card)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {isLoading ? (
        <Skeleton className="mt-4 h-6 w-full rounded-lg" />
      ) : dataLength > 1 ? (
        <div className="mt-4 pr-6 pl-12">
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

"use client";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useUserGrowth } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CustomTooltip } from "@/components/dashboard/chart-styles";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/i18n/format-number";
import type { UserGrowthPoint } from "@/services/types/admin";

const PT_MONTH = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC",
});

/**
 * The month axis label. English keeps the API's own `label` ("Oct 26");
 * Portuguese writes it from the point's `date` ("out/26").
 */
export function growthMonthLabel(
  point: Pick<UserGrowthPoint, "date" | "label">,
  locale: string,
): string {
  if (locale !== "pt-BR") return point.label;
  const date = new Date(`${point.date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return point.label;
  const month = PT_MONTH.format(date).replace(".", "");
  return `${month}/${String(date.getUTCFullYear()).slice(-2)}`;
}

function useGrowthData() {
  const query = useUserGrowth();
  const locale = useLocale();
  const data = query.data?.map((point) => ({
    ...point,
    label: growthMonthLabel(point, locale),
  }));
  return { data, isLoading: query.isLoading, locale };
}

export function UserGrowthChart() {
  const { data, isLoading, locale } = useGrowthData();
  const t = useTranslations("admin.dashboard.growth");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <h3 className="font-display text-sm font-semibold tracking-wide-label text-muted-foreground uppercase">
            {t("title")}
          </h3>
        </div>

        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data}>
              <defs>
                <linearGradient
                  id="adminGrowthGrad"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--chart-3)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-3)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="none"
              />
              <YAxis
                tickFormatter={(value: number) => formatNumber(value, locale)}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="none"
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  fill: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
                }}
              />
              <Area
                type="monotone"
                dataKey="total_users"
                name={t("totalUsers")}
                stroke="var(--chart-3)"
                strokeWidth={2}
                fill="url(#adminGrowthGrad)"
                dot={{ r: 2.5, fill: "var(--chart-3)", strokeWidth: 0 }}
                activeDot={{
                  r: 4,
                  fill: "var(--chart-3)",
                  strokeWidth: 2,
                  stroke: "var(--card)",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </motion.div>
  );
}

export function NewUsersBarChart() {
  const { data, isLoading, locale } = useGrowthData();
  const t = useTranslations("admin.dashboard.growth");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          <h3 className="font-display text-sm font-semibold tracking-wide-label text-muted-foreground uppercase">
            {t("newUsersTitle")}
          </h3>
        </div>

        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} barSize={20}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="none"
              />
              <YAxis
                tickFormatter={(value: number) => formatNumber(value, locale)}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="none"
                allowDecimals={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  fill: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
                }}
              />
              <Bar
                dataKey="new_users"
                name={t("newUsers")}
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                opacity={0.85}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </motion.div>
  );
}

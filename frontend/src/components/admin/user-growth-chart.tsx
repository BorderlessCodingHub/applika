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

export function UserGrowthChart() {
  const { data, isLoading } = useUserGrowth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            User Growth
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
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="none"
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="none"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total_users"
                name="Total Users"
                stroke="#fbbf24"
                strokeWidth={2}
                fill="url(#adminGrowthGrad)"
                dot={{ r: 2.5, fill: "#fbbf24", strokeWidth: 0 }}
                activeDot={{
                  r: 4,
                  fill: "#fbbf24",
                  strokeWidth: 2,
                  stroke: "hsl(var(--card))",
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
  const { data, isLoading } = useUserGrowth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            New Users / Month
          </h3>
        </div>

        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} barSize={20}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="none"
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="none"
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="new_users"
                name="New Users"
                fill="#38bdf8"
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

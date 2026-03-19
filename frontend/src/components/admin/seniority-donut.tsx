"use client";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useSeniorityBreakdown } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CustomTooltip } from "@/components/dashboard/chart-styles";

export function SeniorityDonut() {
  const { data, isLoading } = useSeniorityBreakdown();

  const total = data?.reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-violet-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            Seniority Distribution
          </h3>
        </div>

        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <div className="flex flex-col items-center">
            <div className="relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="level"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {data?.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Center text */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                  {total}
                </span>
                <span className="font-display text-[10px] uppercase tracking-wide-label text-muted-foreground">
                  users
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
              {data?.map((entry) => (
                <div key={entry.level} className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs capitalize text-muted-foreground">
                    {entry.level}
                  </span>
                  <span className="ml-auto font-display text-xs font-medium tabular-nums text-foreground">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

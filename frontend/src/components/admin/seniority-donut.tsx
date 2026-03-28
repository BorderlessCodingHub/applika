"use client";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useSeniorityBreakdown } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CustomTooltip } from "@/components/dashboard/chart-styles";

const RADIAN = Math.PI / 180;

function renderOuterLabel(props: Record<string, unknown>) {
  const { cx, cy, midAngle, outerRadius, percent } = props as {
    cx: number;
    cy: number;
    midAngle: number;
    outerRadius: number;
    percent: number;
  };
  const radius = (outerRadius as number) + 16;
  const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
  const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.03) return null;

  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--muted-foreground))"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={500}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function renderInnerLabel(props: Record<string, unknown>) {
  const { cx, cy, midAngle, innerRadius, outerRadius, value, percent } =
    props as {
      cx: number;
      cy: number;
      midAngle: number;
      innerRadius: number;
      outerRadius: number;
      value: number;
      percent: number;
    };
  if (percent < 0.05) return null;
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
      fontSize={12}
      fontWeight={700}
    >
      {value}
    </text>
  );
}

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
                    label={renderOuterLabel}
                    labelLine={false}
                  >
                    {data?.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.85} />
                    ))}
                  </Pie>
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
                    label={renderInnerLabel}
                    labelLine={false}
                    isAnimationActive={false}
                  >
                    {data?.map((_, i) => (
                      <Cell key={i} fill="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "#8d8d8d12" }}
                  />
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

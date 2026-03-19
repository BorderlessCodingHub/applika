"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useModeStats } from "@/hooks/use-statistics";
import { CustomTooltip } from "./chart-styles";
import { Card } from "../ui/card";

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
              >
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--muted-foreground))" />
              </Pie>
              <Tooltip content={<CustomTooltip />} />
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

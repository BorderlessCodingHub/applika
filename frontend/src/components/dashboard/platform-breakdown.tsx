"use client";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformStats } from "@/hooks/use-statistics";
import { Card } from "../ui/card";

export function PlatformBreakdown() {
  const { data, isLoading } = usePlatformStats();

  const { sorted, total } = useMemo(() => {
    if (!data?.length) return { sorted: [], total: 0 };
    const sorted = [...data].sort(
      (a, b) => b.total_applications - a.total_applications
    );
    const total = sorted.reduce((sum, p) => sum + p.total_applications, 0);
    return { sorted, total };
  }, [data]);

  return (
    <Card className="animate-fade-in-up p-5">
      <h2 className="pb-4 text-base">By Platform</h2>
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded" />
          ))}
        </div>
      ) : (
        <div className="scrollbar-thin max-h-[220px] space-y-2.5 overflow-y-auto pr-1">
          {sorted.map((p) => {
            const pct = total > 0 ? (p.total_applications / total) * 100 : 0;
            return (
              <div key={p.id} className="mr-3 flex items-center gap-3">
                <span className="w-auto shrink-0 truncate text-sm text-muted-foreground">
                  {p.name}
                </span>
                <div className="mt-[2px] flex-grow border-b-2 border-dashed border-gray-600"></div>

                <span className="text-md shrink-0 text-right font-display font-semibold tabular-nums text-foreground">
                  {p.total_applications}
                </span>

                <span className="w-8 text-right text-xs text-muted-foreground">
                  {pct.toFixed(1)}%
                </span>

                <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

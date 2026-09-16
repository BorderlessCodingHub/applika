"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useGeneralStats } from "@/hooks/use-statistics";
import { Card } from "../ui/card";

const STAT_COLORS = {
  total: "text-foreground",
  offers: "text-primary",
  rate: "text-chart-2",
  active: "text-chart-1",
  denied: "text-destructive",
} as const;

type StatColorKey = keyof typeof STAT_COLORS;

function StatCard({
  label,
  value,
  colorKey,
  loading,
}: {
  label: string;
  value: string | number;
  colorKey: StatColorKey;
  loading: boolean;
}) {
  return (
    <Card className="animate-fade-in-up p-4 transition-shadow hover:shadow-card">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
        </div>
      ) : (
        <>
          <span className="font-display text-base font-medium tracking-wide-label text-muted-foreground uppercase">
            {label}
          </span>
          <p
            className={`mt-1 font-numeric text-2xl leading-tight font-bold ${STAT_COLORS[colorKey] ?? "text-foreground"}`}
          >
            {value}
          </p>
        </>
      )}
    </Card>
  );
}

export function StatCards({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading } = useGeneralStats(cycleId);

  const active = data
    ? data.total_applications - (data.denials ?? 0) - (data.offers ?? 0)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Active"
        value={active}
        colorKey="active"
        loading={isLoading}
      />
      <StatCard
        label="Offers"
        value={data?.offers ?? 0}
        colorKey="offers"
        loading={isLoading}
      />
      <StatCard
        label="Denials"
        value={data?.denials ?? 0}
        colorKey="denied"
        loading={isLoading}
      />
      <StatCard
        label="Total"
        value={data?.total_applications ?? 0}
        colorKey="total"
        loading={isLoading}
      />
      <StatCard
        label="Success Rate"
        value={`${data?.success_rate ?? 0}%`}
        colorKey="offers"
        loading={isLoading}
      />
    </div>
  );
}

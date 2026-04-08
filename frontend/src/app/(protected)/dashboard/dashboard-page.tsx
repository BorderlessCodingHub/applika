"use client";

import { StatCards } from "@/components/dashboard/stat-cards";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { StepConversionChart } from "@/components/dashboard/step-conversion-chart";
import { AvgDaysPerStepChart } from "@/components/dashboard/avg-days-per-step-chart";
import { PlatformBreakdown } from "@/components/dashboard/platform-breakdown";
import { ActiveVsPassiveChart } from "@/components/dashboard/active-vs-passive-chart";
import { useCycleContext } from "@/contexts/cycle-context";

export function DashboardPage() {
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground">
          Dashboard
        </h1>
        <p className="mt-0.5 text-base text-muted-foreground">
          {isViewingPastCycle
            ? "Viewing archived cycle"
            : "Your application analytics at a glance"}
        </p>
      </div>

      <StatCards cycleId={selectedCycleId} />

      <ApplicationTrendChart cycleId={selectedCycleId} />

      <div className="grid gap-3 md:grid-cols-2">
        <StepConversionChart cycleId={selectedCycleId} />
        <AvgDaysPerStepChart cycleId={selectedCycleId} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PlatformBreakdown cycleId={selectedCycleId} />
        <ActiveVsPassiveChart cycleId={selectedCycleId} />
      </div>
    </div>
  );
}

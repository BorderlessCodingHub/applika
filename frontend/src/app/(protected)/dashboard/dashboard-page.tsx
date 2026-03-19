"use client";

import { StatCards } from "@/components/dashboard/stat-cards";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { StepConversionChart } from "@/components/dashboard/step-conversion-chart";
import { AvgDaysPerStepChart } from "@/components/dashboard/avg-days-per-step-chart";
import { PlatformBreakdown } from "@/components/dashboard/platform-breakdown";
import { ActiveVsPassiveChart } from "@/components/dashboard/active-vs-passive-chart";

export function DashboardPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground">
          Dashboard
        </h1>
        <p className="mt-0.5 text-base text-muted-foreground">
          Your application analytics at a glance
        </p>
      </div>

      <StatCards />

      <ApplicationTrendChart />

      <div className="grid gap-3 md:grid-cols-2">
        <StepConversionChart />
        <AvgDaysPerStepChart />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PlatformBreakdown />
        <ActiveVsPassiveChart />
      </div>
    </div>
  );
}

import { Suspense } from "react";
import DashboardCard from "@/components/ui/DashboardCard";
import CardSkeleton from "@/components/ui/CardSkeleton";

import ApplicationAnalyticsDashboardClient from "@/features/home/components/ApplicationAnalyticsDashboardCard/index";
import ApplicationsByStepCard from "@/features/home/components/ApplicationsByStepCard/index";
import ConversionFunnelCard from "@/features/home/components/ConversionFunnelCard/index";
import AverageDaysChartCard from "@/features/home/components/AvarageDaysChartCard/index";
import ApplicationsByPlatformCard from "@/features/home/components/ApplicationsByPlatformCard/index";
import ApplicationModeCard from "@/features/home/components/ApplicationsModeCard/index";
import ApplicationTrendCard from "@/features/home/components/ApplicationTrendCard/index";

export default async function HomePage() {
  return (
    <main>
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard fullWidth>
          <Suspense fallback={<CardSkeleton />}>
            <ApplicationAnalyticsDashboardClient />
          </Suspense>
        </DashboardCard>

        <DashboardCard>
          <Suspense fallback={<CardSkeleton />}>
            <ApplicationsByStepCard />
          </Suspense>
        </DashboardCard>

        <DashboardCard>
          <Suspense fallback={<CardSkeleton />}>
            <ConversionFunnelCard />
          </Suspense>
        </DashboardCard>

        <DashboardCard fullWidth>
          <Suspense fallback={<CardSkeleton />}>
            <AverageDaysChartCard />
          </Suspense>
        </DashboardCard>

        <DashboardCard>
          <Suspense fallback={<CardSkeleton />}>
            <ApplicationsByPlatformCard />
          </Suspense>
        </DashboardCard>

        <DashboardCard>
          <Suspense fallback={<CardSkeleton />}>
            <ApplicationModeCard />
          </Suspense>
        </DashboardCard>

        <DashboardCard fullWidth>
          <Suspense fallback={<CardSkeleton />}>
            <ApplicationTrendCard />
          </Suspense>
        </DashboardCard>
      </section>
    </main>
  );
}

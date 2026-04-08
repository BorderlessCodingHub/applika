import DashboardCard from "@/components/ui/DashboardCard";

import ApplicationAnalyticsDashboardClient from "@/features/home/components/ApplicationAnalyticsDashboardCard";
import ApplicationsByStepCard from "@/features/home/components/ApplicationsByStepCard";
import ConversionFunnelCard from "@/features/home/components/ConversionFunnelCard";
import AverageDaysChartCard from "@/features/home/components/AvarageDaysChartCard";
import ApplicationsByPlatformCard from "@/features/home/components/ApplicationsByPlatformCard";
import ApplicationModeCard from "@/features/home/components/ApplicationsModeCard";
import ApplicationTrendCard from "@/features/home/components/ApplicationTrendCard";

const dashboardCards = [
  { component: ApplicationAnalyticsDashboardClient, fullWidth: true },
  { component: ApplicationsByStepCard, fullWidth: false },
  { component: ConversionFunnelCard, fullWidth: false },
  { component: AverageDaysChartCard, fullWidth: true },
  { component: ApplicationsByPlatformCard, fullWidth: false },
  { component: ApplicationModeCard, fullWidth: false },
  { component: ApplicationTrendCard, fullWidth: true },
];

export default function DashboardSection() {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {dashboardCards.map(({ component: Component, fullWidth }, idx) => (
        <DashboardCard key={idx} fullWidth={fullWidth}>
          <Component />
        </DashboardCard>
      ))}
    </section>
  );
}

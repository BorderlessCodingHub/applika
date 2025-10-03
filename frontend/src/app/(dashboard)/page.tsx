import DashboardCard from "@/components/ui/DashboardCard";
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
          <ApplicationAnalyticsDashboardClient />
        </DashboardCard>
        <DashboardCard>
          <ApplicationsByStepCard />
        </DashboardCard>
        <DashboardCard>
          <ConversionFunnelCard />
        </DashboardCard>
        <DashboardCard fullWidth>
          <AverageDaysChartCard />
        </DashboardCard>
        <DashboardCard>
          <ApplicationsByPlatformCard />
        </DashboardCard>
        <DashboardCard>
          <ApplicationModeCard />
        </DashboardCard>
        <DashboardCard fullWidth>
          <ApplicationTrendCard />
        </DashboardCard>
      </section>
    </main>
  );
}

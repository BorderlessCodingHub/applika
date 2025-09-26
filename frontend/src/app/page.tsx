'use client';

import ApplicationAnalyticsDashboard from '@/components/ApplicationAnalyticsDashboardCard'
import ApplicationsByStepCard from '@/components/ApplicationsByStepCard'
import ConversionFunnelCard from '@/components/ConversionFunnelCard'
import AverageDaysChartCard from '@/components/AverageDaysChartCard'
import ApplicationsByPlatformCard from '@/components/ApplicationsByPlatformCard'
import ApplicationModeCard from '@/components/ApplicationModeCard'
import ApplicationTrendCard from '@/components/ApplicationTrendCard'

const testData = {
    totalApplications: 120,
    totalOffers: 45,
    successRate: 37.5,
    totalDenials: 30
  }

  const sampleData = [
    { step_name: 'Applied', count: 120, conversion_rate: 100, step_color: '#4ade80' },
    { step_name: 'Interview', count: 80, conversion_rate: 66.7, step_color: '#60a5fa' },
    { step_name: 'Offer', count: 45, conversion_rate: 37.5, step_color: '#facc15' },
    { step_name: 'Hired', count: 30, conversion_rate: 25, step_color: '#f87171' },
  ];

  const conversionSample = [
    { name: 'Applied', rate: 100, color: '#4ade80' },
    { name: 'Interview', rate: 70, color: '#60a5fa' },
    { name: 'Offer', rate: 40, color: '#facc15' },
    { name: 'Hired', rate: 25, color: '#f87171' },
  ];

  const averageDaysSample = [
    { name: 'Applied → Interview', days: 5, color: '#4ade80' },
    { name: 'Interview → Offer', days: 7, color: '#60a5fa' },
    { name: 'Offer → Hired', days: 10, color: '#facc15' }
  ];

  const platformsSample = [
    { platform_name: 'Web', count: 70 },
    { platform_name: 'iOS', count: 30 },
    { platform_name: 'Android', count: 20 },
    { platform_name: 'Others', count: 10 }
  ];

  const modesSample = [
  { mode: 'online', count: 80 },
  { mode: 'offline', count: 40 },
  { mode: 'referral', count: 20 }
];

  const last30DaysData = [
    { month: 'Sep 1', count: 5 },
    { month: 'Sep 2', count: 7 },
    { month: 'Sep 3', count: 3 },
    { month: 'Sep 4', count: 8 },
    { month: 'Sep 5', count: 6 },
    { month: 'Sep 6', count: 4 },
    { month: 'Sep 7', count: 9 },
    // ...continue for 30 days
  ];

export default function Page() {
   
  const totalApps = platformsSample.reduce((acc, cur) => acc + cur.count, 0);
  
  return (
     <main>
      <ApplicationAnalyticsDashboard
        totalApplications={testData.totalApplications}
        totalOffers={testData.totalOffers}
        successRate={testData.successRate}
        totalDenials={testData.totalDenials}
      />
      <ApplicationsByStepCard conversionData={sampleData} />
      <ConversionFunnelCard conversionData={conversionSample} />
      <AverageDaysChartCard averageDaysData={averageDaysSample} />
      <ApplicationsByPlatformCard applicationsByPlatform={platformsSample} totalApplications={totalApps} />
      <ApplicationModeCard applicationsByMode={modesSample} totalApplications={totalApps} />
       <ApplicationTrendCard monthlyData={last30DaysData} />
    </main>
  )
}

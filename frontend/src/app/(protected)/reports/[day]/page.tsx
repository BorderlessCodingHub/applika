import { ReportDays, ReportDaysType } from "@/services/types/reports";
import { BadgeGate } from "@/components/badges/badge-gate";
import { ReportDayClient } from "./report-day-page";

interface Props {
  params: Promise<{ day: ReportDaysType }>;
}

export function generateStaticParams() {
  return ReportDays.map((day) => ({ day: String(day) }));
}

export default async function ReportDayPage({ params }: Props) {
  const { day } = await params;
  return (
    <BadgeGate>
      <ReportDayClient day={day} />
    </BadgeGate>
  );
}

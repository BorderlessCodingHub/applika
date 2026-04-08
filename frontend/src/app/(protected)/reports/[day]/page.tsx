import { ReportDays, ReportDaysType } from "@/services/types/reports";
import { ReportDayClient } from "./report-day-page";

interface Props {
  params: Promise<{ day: ReportDaysType }>;
}

export function generateStaticParams() {
  return ReportDays.map((day) => ({ day: String(day) }));
}

export default async function ReportDayPage({ params }: Props) {
  const { day } = await params;
  return <ReportDayClient day={day} />;
}

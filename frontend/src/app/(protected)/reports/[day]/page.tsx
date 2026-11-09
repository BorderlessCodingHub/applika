import { ReportDays, ReportDaysType } from "@/services/types/reports";
import { ReportDayRoute } from "./report-day-route";

interface Props {
  params: Promise<{ day: ReportDaysType }>;
}

export function generateStaticParams() {
  return ReportDays.map((day) => ({ day: String(day) }));
}

export default async function ReportDayPage({ params }: Props) {
  const { day } = await params;
  return <ReportDayRoute day={day} />;
}

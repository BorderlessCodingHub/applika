"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReportDays, type ReportDaysType } from "@/services/types/reports";
import { useReportDetail } from "@/hooks/use-repports";
import { ReportForm } from "@/components/reports/report-form";
import { ReportReadOnly } from "@/components/reports/report-view";
import { FormSkeleton } from "@/components/reports/sub-components";

interface Props {
  day: ReportDaysType;
}

export function ReportDayClient({ day }: Props) {
  const router = useRouter();

  const dayNumber = Number(day);
  const isValid = (ReportDays as readonly number[]).includes(dayNumber);

  useEffect(() => {
    if (!isValid) {
      router.replace("/reports");
    }
  }, [isValid, router]);

  if (!isValid) {
    return null;
  }

  return (
    <ReportDetail
      dayInterval={dayNumber as ReportDaysType}
      onCancel={() => router.push("/reports")}
    />
  );
}

interface ReportDetailProps {
  dayInterval: ReportDaysType;
  onCancel?: () => void;
}

function ReportDetail({ dayInterval, onCancel }: ReportDetailProps) {
  const [startDate, setStartDate] = useState<string | undefined>(undefined);

  const { reportData, isLoading, isAvailable } = useReportDetail(
    dayInterval,
    startDate,
  );

  useEffect(() => {
    if (isAvailable != undefined && !isAvailable && onCancel) {
      onCancel();
    }
  }, [isAvailable, onCancel]);

  if (isLoading || !isAvailable) return <FormSkeleton />;

  if (reportData && reportData.can_submit)
    return (
      <ReportForm
        onStartDateChange={(value) => setStartDate(value)}
        reportData={reportData}
        dayInterval={dayInterval}
        onCancel={onCancel}
      />
    );

  if (reportData)
    return (
      <ReportReadOnly
        reportData={reportData}
        dayInterval={dayInterval}
        onCancel={onCancel}
      />
    );

  return <FormSkeleton />;
}

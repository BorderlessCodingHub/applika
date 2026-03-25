"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReportForm } from "@/components/reports/report-form";
import { ReportDays, type ReportDaysType } from "@/services/types/reports";

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
    <ReportForm
      dayInterval={dayNumber as ReportDaysType}
      onCancel={() => router.push("/reports")}
    />
  );
}

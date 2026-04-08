"use client";

import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ReportForm } from "@/features/reports/components/ReportForm";
import { useReportDetail } from "@/features/reports/hooks/useReportDetail";

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isNumericDay = /^\d+$/.test(resolvedParams.day);
  const day = isNumericDay ? Number.parseInt(resolvedParams.day, 10) : null;
  const invalidDayParam = day === null;

  const { reportData, isLoading, error } = useReportDetail(day);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current !== null) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleBack = () => {
    router.push("/reports");
  };

  const handleSuccess = () => {
    if (redirectTimeoutRef.current !== null) {
      clearTimeout(redirectTimeoutRef.current);
    }

    redirectTimeoutRef.current = setTimeout(() => {
      router.push("/reports");
    }, 1500);
  };

  const normalizedError = error instanceof Error ? error : null;
  const routeError = invalidDayParam
    ? new Error("Invalid report day. Use a numeric report URL.")
    : normalizedError;
  const shouldShowLoading = invalidDayParam ? false : isLoading;

  return (
    <ReportForm
      reportData={reportData}
      day={day}
      isLoading={shouldShowLoading}
      error={routeError}
      onBack={handleBack}
      onSuccess={handleSuccess}
    />
  );
}

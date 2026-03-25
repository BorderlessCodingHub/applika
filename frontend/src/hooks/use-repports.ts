"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import { ReportDaysType, ReportSubmitPayload } from "@/services/types/reports";

const REPORTS_KEY = ["reports"] as const;

function reportDetailKey(day: ReportDaysType | 0) {
  return ["reports", "detail", String(day)] as const;
}

export function useReportDetail(day: ReportDaysType | null) {
  const query = useQuery({
    queryKey: reportDetailKey(day ?? 0),
    queryFn: () => services.reports.fetchReportDetail(day!),
    enabled: day !== null,
  });

  const data = query.data ?? null
  return {
    reportData: query.data ?? null,
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    isAvailable: data?.can_submit || data?.report.submitted
  } as const;
}

export function useReports() {
  const query = useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => services.reports.fetchReports(),
  });

  return {
    reports: query.data?.reports || [],
    currentDay: query.data?.current_day || 0,
    currentPhase: query.data?.current_phase || 0,
    startDate: query.data?.start_date || "",
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    error: query.error,
  };
}

interface UseReportSubmitReturn {
  submit: (day: ReportDaysType, payload: ReportSubmitPayload) => Promise<void>;
  isSubmitting: boolean;
  isSuccess: boolean;
  error: Error | null;
  reset: () => void;
}

export function useReportSubmit(): UseReportSubmitReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ day, payload }: { day: ReportDaysType; payload: ReportSubmitPayload }) =>
      services.reports.submitReport(day, payload),
    onSuccess: (_data, { day }) => {
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      queryClient.invalidateQueries({ queryKey: reportDetailKey(day) });
    },
    onError: () => toast.error("Failed to submit report"),
  });

  const submit = async (day: ReportDaysType, payload: ReportSubmitPayload) => {
    await mutation.mutateAsync({ day, payload });
  };

  return {
    submit,
    isSubmitting: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}

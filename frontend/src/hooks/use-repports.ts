"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import { ReportDaysType, ReportSubmitPayload } from "@/services/types/reports";

const REPORTS_KEY = ["reports"] as const;

function reportDetailKey(day: ReportDaysType | 0, startDate?: string) {
  return ["report", "detail", String(day), startDate ?? ""] as const;
}

function reportDetailPrefixKey(day: ReportDaysType | 0) {
  return ["report", "detail", String(day)] as const;
}

export function useReportDetail(
  day: ReportDaysType | null,
  startDate?: string,
) {
  const query = useQuery({
    queryKey: reportDetailKey(day ?? 0, startDate),
    queryFn: () => services.reports.fetchReportDetail(day!, startDate),
    enabled: day !== null,
    placeholderData: keepPreviousData,
  });

  const data = query.data ?? null;
  return {
    reportData: query.data ?? null,
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    isAvailable: data?.can_submit || data?.report.submitted,
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
    mutationFn: ({
      day,
      payload,
    }: {
      day: ReportDaysType;
      payload: ReportSubmitPayload;
    }) => services.reports.submitReport(day, payload),
    onSuccess: async (_data, { day }) => {
      await queryClient.invalidateQueries({ queryKey: reportDetailPrefixKey(day) });
      await queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
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

"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { word } from "@/i18n/translator";
import { services } from "@/services/services";
import { rateLimitNotice } from "@/lib/rate-limit";
import { membershipAccess } from "@/components/badges/membership-badge";
import { USER_QUERY_KEY, useUserProfile } from "@/hooks/use-user";
import { apiErrorCode } from "@/lib/api-error-message";
import { MEMBERSHIP_LOCKED_CODE } from "@/services/types/auth";
import { ReportDaysType, ReportSubmitPayload } from "@/services/types/reports";
import type { User } from "@/services/types/users";

const REPORTS_KEY = ["reports"] as const;

/**
 * Report routes answer 403 unless the BASE or PSP badge counts (ADR-0024,
 * ADR-0026): the queries stay off until the cached user holds one. Reads the cache
 * only; `AuthProvider` owns the `/users/me` fetch.
 */
export function useHoldsReportsBadge(): boolean {
  const { data: user } = useUserProfile(false);
  return membershipAccess(user).state === "held";
}

/**
 * A report request answered 403 AUTH-1050 (ADR-0026): Borderless refused
 * applika's grant after the user was loaded. The cached user follows, so
 * `BadgeGate` shows the words and "Sign in again", and the chip and the menu
 * agree with it. `true` when it did; anything else is left to the caller.
 */
export function lockOnRefusedGrant(
  queryClient: QueryClient,
  error: unknown,
): boolean {
  if (!(error instanceof AxiosError) || error.response?.status !== 403) {
    return false;
  }
  if (apiErrorCode(error.response.data) !== MEMBERSHIP_LOCKED_CODE) {
    return false;
  }
  queryClient.setQueryData<User>(USER_QUERY_KEY, (user) =>
    user?.borderless
      ? {
          ...user,
          borderless: { ...user.borderless, status: "needs_reconnect" },
        }
      : user,
  );
  return true;
}

function reportDetailKey(day: ReportDaysType | 0, startDate?: string) {
  return ["report", "detail", String(day), startDate ?? ""] as const;
}

function reportDetailPrefixKey(day: ReportDaysType | 0) {
  return ["report", "detail", String(day)] as const;
}

export function useReportDetail(
  day: ReportDaysType | null,
  startDate?: string,
  cycleId?: string | null,
) {
  const held = useHoldsReportsBadge();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...reportDetailKey(day ?? 0, startDate), cycleId ?? "current"],
    queryFn: () =>
      services.reports
        .fetchReportDetail(day!, startDate, cycleId)
        .catch((error: unknown) => {
          lockOnRefusedGrant(queryClient, error);
          throw error;
        }),
    enabled: held && day !== null,
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

export function useReports(cycleId?: string | null) {
  const held = useHoldsReportsBadge();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...REPORTS_KEY, cycleId ?? "current"],
    queryFn: () =>
      services.reports.fetchReports(cycleId).catch((error: unknown) => {
        lockOnRefusedGrant(queryClient, error);
        throw error;
      }),
    enabled: held,
  });

  return {
    reports: query.data?.reports || [],
    currentDay: query.data?.current_day || 0,
    currentPhase: query.data?.current_phase || 0,
    startDate: query.data?.start_date || "",
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    error: query.error,
    /** The raw answer and its query state, for a section's `fromQuery`. */
    data: query.data,
    isError: query.isError,
    refetch: query.refetch,
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
      await queryClient.invalidateQueries({
        queryKey: reportDetailPrefixKey(day),
      });
      await queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
    },
    onError: (error) => {
      // AUTH-1050: the gate takes over with its own words; no second message.
      if (lockOnRefusedGrant(queryClient, error)) return;
      toast.error(rateLimitNotice(error) ?? word("reports.toast.submitFailed"));
    },
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

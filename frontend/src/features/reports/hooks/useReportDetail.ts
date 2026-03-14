import { useMemo } from "react";
import useSWR from "swr";
import { fetchReportDetail } from "../services/reportsService";
import type { ReportDetailResponse } from "../types/report.types";

function reportDetailSWRKey(day: number) {
  return ["reports/detail", String(day)] as const;
}

async function reportDetailFetcher([
  ,
  day,
]: readonly [string, string]): Promise<ReportDetailResponse> {
  return fetchReportDetail(Number(day));
}

export function useReportDetail(day?: number | null) {
  const key = useMemo(() => {
    if (typeof day !== "number" || Number.isNaN(day)) return null;
    return reportDetailSWRKey(day);
  }, [day]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ReportDetailResponse>(key, key ? reportDetailFetcher : null, {
      revalidateOnFocus: false,
      keepPreviousData: true,
    });

  return {
    reportData: data ?? null,
    isLoading,
    isValidating,
    error,
    mutate,
  } as const;
}

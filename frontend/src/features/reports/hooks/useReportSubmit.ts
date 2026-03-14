import { useState } from "react";
import useSWRMutation from "swr/mutation";
import type { ReportSubmitPayload } from "../types/report.types";
import { submitReport } from "../services/reportsService";
import { mutateReports } from "./useReports";

async function submitReportFetcher(
  url: string,
  { arg }: { arg: { day: number; payload: ReportSubmitPayload } }
) {
  const { day, payload } = arg;
  return await submitReport(day, payload);
}

interface UseReportSubmitReturn {
  submit: (day: number, payload: ReportSubmitPayload) => Promise<void>;
  isSubmitting: boolean;
  isSuccess: boolean;
  error: Error | null;
  reset: () => void;
}

export function useReportSubmit(): UseReportSubmitReturn {
  const [isSuccess, setIsSuccess] = useState(false);

  const { trigger, isMutating, error, reset: resetMutation } = useSWRMutation(
    "/api/reports/{day}/submit",
    submitReportFetcher
  );

  const submit = async (day: number, payload: ReportSubmitPayload) => {
    try {
      await trigger({ day, payload });
      setIsSuccess(true);
      await mutateReports();
    } catch (err) {
      throw err;
    }
  };

  const reset = () => {
    setIsSuccess(false);
    resetMutation();
  };

  return {
    submit,
    isSubmitting: isMutating,
    isSuccess,
    error: error as Error | null,
    reset,
  };
}

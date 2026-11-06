"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { BASE_CVS_QUERY_KEY } from "@/hooks/use-base-cvs";
import { JOB_QUERY_KEY, JOBS_QUERY_KEY } from "@/hooks/use-jobs";
import { word } from "@/i18n/translator";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";

/** Delete one master CV. Frees a slot, so the create affordance comes back. */
export function useDeleteBaseCv(opts?: {
  onSuccess?: () => void;
  onSettled?: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => services.baseCvs.remove(id),
    onSuccess: async () => {
      // R-016: every job's fit depends on the master CVs (Plan corrections 14).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BASE_CVS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: JOB_QUERY_KEY }),
      ]);
      toast.success(word("cvs.toasts.deleted"));
      opts?.onSuccess?.();
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
    onSettled: () => opts?.onSettled?.(),
  });
}

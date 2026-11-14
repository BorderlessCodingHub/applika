"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { APPLICATION_CV_FIT_QUERY_KEY } from "@/hooks/use-application-cv-fit";
import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";
import { word } from "@/i18n/translator";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";

/**
 * Delete this application's CV copy.
 *
 * Deleting frees the application to take a new copy from any master CV, so the
 * invalidation is what puts the picker back on screen: the CV query refetches,
 * answers 404, and the page falls back to the picker.
 */
export function useDeleteTailoredCv(
  applicationId: string,
  opts?: { onSuccess?: () => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => services.tailoredCvs.remove(applicationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: APPLICATION_CV_FIT_QUERY_KEY,
        }),
      ]);
      toast.success(word("cvs.toasts.copyDeleted"));
      opts?.onSuccess?.();
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { TailoredCv } from "@/services/types/tailored-cv";

/**
 * Create this application's CV copy from a master CV.
 *
 * The API refuses a second copy with 409, a finalized application with 409 and
 * a closed-cycle one with 422 — each with a `{detail}` the toast shows verbatim,
 * so the user is told which rule they hit rather than "something went wrong".
 */
export function useCreateTailoredCv(
  applicationId: string,
  opts?: { onSuccess?: (cv: TailoredCv) => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (baseCvId: string) =>
      services.tailoredCvs.create(applicationId, { base_cv_id: baseCvId }),
    onSuccess: async (cv) => {
      await queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY });
      toast.success("CV copy created");
      opts?.onSuccess?.(cv);
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

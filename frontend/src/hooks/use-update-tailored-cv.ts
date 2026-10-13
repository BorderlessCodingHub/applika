"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { APPLICATION_CV_FIT_QUERY_KEY } from "@/hooks/use-application-cv-fit";
import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type {
  TailoredCv,
  UpdateTailoredCvPayload,
} from "@/services/types/tailored-cv";

/**
 * Save this application's CV copy. `PUT` is a full replace, so the editor sends
 * every editable field. 409 (finalized) and 422 (closed cycle) reach the user as
 * the server's own `{detail}`.
 */
export function useUpdateTailoredCv(
  applicationId: string,
  opts?: { onSuccess?: (cv: TailoredCv) => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateTailoredCvPayload) =>
      services.tailoredCvs.update(applicationId, data),
    onSuccess: async (cv) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: APPLICATION_CV_FIT_QUERY_KEY,
        }),
      ]);
      toast.success("CV copy saved");
      opts?.onSuccess?.(cv);
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

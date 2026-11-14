"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { APPLICATION_CV_FIT_QUERY_KEY } from "@/hooks/use-application-cv-fit";
import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";
import { word } from "@/i18n/translator";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { TailoredCv, TailoringMode } from "@/services/types/tailored-cv";

export interface CreateTailoredCvInput {
  baseCvId: string;
  /** Defaults to `"copy"` (verbatim). `"keywords"` only when the user opted in (R-026). */
  tailoring?: TailoringMode;
}

/**
 * Create this application's CV copy from a master CV.
 *
 * The API refuses a second copy with 409, a finalized application with 409 and
 * a closed-cycle one with 422 — each with a `{detail}` the toast shows verbatim,
 * so the user is told which rule they hit rather than "something went wrong".
 * `tailoring: "keywords"` on an application with no job description is a 422
 * ("Add a job description to tailor by keywords"), shown the same way.
 */
export function useCreateTailoredCv(
  applicationId: string,
  opts?: { onSuccess?: (cv: TailoredCv) => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ baseCvId, tailoring = "copy" }: CreateTailoredCvInput) =>
      services.tailoredCvs.create(applicationId, baseCvId, tailoring),
    onSuccess: async (cv) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: APPLICATION_CV_FIT_QUERY_KEY,
        }),
      ]);
      toast.success(word("cvs.toasts.copyCreated"));
      opts?.onSuccess?.(cv);
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

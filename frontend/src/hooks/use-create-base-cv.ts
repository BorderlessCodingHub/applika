"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { BASE_CVS_QUERY_KEY } from "@/hooks/use-base-cvs";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { BaseCv, CreateBaseCvPayload } from "@/services/types/base-cv";

/**
 * Create a master CV.
 *
 * The API refuses the fourth one with 409 and a `{detail}` explaining the cap.
 * `getApiError` returns that `detail` verbatim, so the toast tells the user
 * exactly what the server said.
 */
export function useCreateBaseCv(opts?: { onSuccess?: (cv: BaseCv) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBaseCvPayload) => services.baseCvs.create(data),
    onSuccess: async (cv) => {
      await queryClient.invalidateQueries({ queryKey: BASE_CVS_QUERY_KEY });
      toast.success("Master CV created");
      opts?.onSuccess?.(cv);
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

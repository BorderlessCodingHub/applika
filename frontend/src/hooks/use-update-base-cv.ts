"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { BASE_CVS_QUERY_KEY } from "@/hooks/use-base-cvs";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { BaseCv, UpdateBaseCvPayload } from "@/services/types/base-cv";

/** Update one master CV. `PATCH` is partial; the editor sends the full editable shape. */
export function useUpdateBaseCv(
  id: string,
  opts?: { onSuccess?: (cv: BaseCv) => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateBaseCvPayload) =>
      services.baseCvs.update(id, data),
    onSuccess: async (cv) => {
      await queryClient.invalidateQueries({ queryKey: BASE_CVS_QUERY_KEY });
      toast.success("Master CV saved");
      opts?.onSuccess?.(cv);
    },
    onError: (error: AxiosError) => toast.error(getApiError(error)),
  });
}

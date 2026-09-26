"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  findPlatformByName,
  PLATFORM_SELECT_COPY,
  type NewPlatformInput,
  type PlatformCreateOutcome,
} from "@/components/applications/platform-select";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { Supports } from "@/services/types/supports";

/** `POST /platforms` (PRD 0010). Invalidates `["supports"]` on success. */
export function useCreatePlatform() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewPlatformInput) =>
      services.platforms.create({ name: input.name, url: input.url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supports"] });
    },
  });
}

/**
 * Wraps `useCreatePlatform` into the `PlatformSelect`/`ApplicationFields`
 * `onCreate` contract: 409 refetches `["supports"]` and resolves the matching
 * row so the picker can select it with the server's own message (AC17);
 * anything else resolves `{status: "failed"}` rather than throwing, which is
 * what keeps the create form open.
 */
export function useCreatePlatformOutcome() {
  const create = useCreatePlatform();
  const queryClient = useQueryClient();

  return async (input: NewPlatformInput): Promise<PlatformCreateOutcome> => {
    try {
      const platform = await create.mutateAsync(input);
      return { status: "created", platform };
    } catch (error) {
      if (isAxiosError(error)) {
        const message = getApiError(error);
        if (error.response?.status === 409) {
          const supports = await queryClient.fetchQuery<Supports>({
            queryKey: ["supports"],
            queryFn: () => services.supports.getSupports(),
          });
          const platform = findPlatformByName(supports.platforms, input.name);
          return { status: "exists", message, platform: platform ?? null };
        }
        return { status: "failed", message };
      }
      return { status: "failed", message: PLATFORM_SELECT_COPY.createFailed };
    }
  };
}

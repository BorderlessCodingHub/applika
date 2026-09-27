"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { services } from "@/services/services";
import type { Draft, DraftInput } from "@/services/types/application-drafts";
import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";

/** Root cache key for drafts. `GET /applications/drafts` (newest first). */
export const APPLICATION_DRAFTS_QUERY_KEY = ["application-drafts"] as const;

export function useDrafts() {
  return useQuery({
    queryKey: APPLICATION_DRAFTS_QUERY_KEY,
    queryFn: () => services.applicationDrafts.list(),
  });
}

/** One draft by id. A 404 means it was finished or deleted — not a failure to retry. */
export function useDraft(id: string | null | undefined) {
  return useQuery({
    queryKey: [...APPLICATION_DRAFTS_QUERY_KEY, id],
    queryFn: () => services.applicationDrafts.get(id as string),
    enabled: Boolean(id),
  });
}

/** No toast: this fires as a side effect of autosave (AC6).
 *
 * `networkMode: "always"` (KODI-034, owner-ordered 2026-09-26): TanStack
 * Query 5 mutations default to `networkMode: "online"`, which PAUSES the
 * mutation (stays `isPaused: true`, `status: "pending"`) instead of letting
 * it fail while the browser is offline — the debounced autosave loop then
 * never sees a rejection and `AutosaveStatus` sticks on "Saving..." forever
 * (PRD 0010 edge case l.148, R-008: a failed save must say "not saved" and
 * retry on the next change). `"always"` fires the mutation regardless of
 * `navigator.onLine`/`onlineManager`, so the fetch itself throws offline and
 * the existing autosave error path ("Not saved" + Retry) takes over
 * unchanged. */
export function useCreateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DraftInput) => services.applicationDrafts.create(data),
    networkMode: "always",
    onSuccess: (draft: Draft) => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_DRAFTS_QUERY_KEY });
      queryClient.setQueryData(
        [...APPLICATION_DRAFTS_QUERY_KEY, draft.id],
        draft,
      );
    },
  });
}

/** No toast: this fires ~once per second of typing (AC7).
 *
 * `networkMode: "always"` — see {@link useCreateDraft}: same offline-autosave
 * fix, same reason (KODI-034). */
export function useUpdateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DraftInput }) =>
      services.applicationDrafts.update(id, data),
    networkMode: "always",
    onSuccess: (draft: Draft) => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_DRAFTS_QUERY_KEY });
      queryClient.setQueryData(
        [...APPLICATION_DRAFTS_QUERY_KEY, draft.id],
        draft,
      );
    },
  });
}

export function useDeleteDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.applicationDrafts.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_DRAFTS_QUERY_KEY });
    },
  });
}

/** Turns the draft into a normal application (AC10): invalidates applications, statistics and drafts. */
export function useFinishDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      applicationDate,
    }: {
      id: string;
      applicationDate: string;
    }) => services.applicationDrafts.finish(id, applicationDate),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["statistics"] }),
        queryClient.invalidateQueries({
          queryKey: APPLICATION_DRAFTS_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY }),
      ]);
    },
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { services } from "@/services/services";

/**
 * Root cache key for the CV copy's fit (R-028). Invalidate it after every write
 * that can move the score: the copy's create, update and delete, and every save
 * of the application's job description (draft autosave, the application edit).
 */
export const APPLICATION_CV_FIT_QUERY_KEY = ["application-cv-fit"] as const;

/**
 * `GET /applications/{id}/cv/fit`. A 404 (no copy, or not the caller's) is an
 * ordinary "no panel" answer, separated from a real failure with
 * `isNoTailoredCv` — the shared client sets `retry: false`, so it costs one
 * round trip.
 *
 * `enabled` is the caller's "a copy exists AND the job description is not
 * blank": with no copy there is nothing to score, and with a blank job
 * description the server answers `score: null`, which shows no panel either —
 * skipping the request also skips a loading card that would only vanish.
 */
export function useApplicationCvFit(
  applicationId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...APPLICATION_CV_FIT_QUERY_KEY, applicationId],
    queryFn: () => services.tailoredCvs.getFit(applicationId as string),
    enabled: Boolean(applicationId) && enabled,
  });
}

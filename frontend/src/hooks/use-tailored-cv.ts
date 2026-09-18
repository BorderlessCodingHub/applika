"use client";

import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { services } from "@/services/services";

/** Root cache key for every CV-copy query. Invalidate it after any write. */
export const TAILORED_CVS_QUERY_KEY = ["tailored-cvs"] as const;

/** `true` when the failure is the API saying "this application has no copy". */
export function isNoTailoredCv(error: unknown): boolean {
  return (error as AxiosError | null)?.response?.status === 404;
}

/**
 * One application's CV copy.
 *
 * A 404 is not a failure here — it is the ordinary answer for an application
 * that has no copy yet, and the page renders the picker for it. So the caller
 * separates "no copy" from "could not load" with `isNoTailoredCv` rather than
 * treating `isError` as a problem. (Nothing retries: the shared client sets
 * `retry: false`, so the 404 costs exactly one round trip.)
 *
 * Idle until an application id is known: the route reads it from `?id=`, which
 * is `null` on the first client frame.
 */
export function useTailoredCv(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: [...TAILORED_CVS_QUERY_KEY, applicationId],
    queryFn: () => services.tailoredCvs.get(applicationId as string),
    enabled: Boolean(applicationId),
  });
}

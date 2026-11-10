import type { AxiosError } from "axios";

import type { PhoneLoad } from "@/components/phone/phone-load";
import { getApiError } from "@/lib/api-client";

/** What a phone section reads off a TanStack query (or `useApplications`). */
export interface PhoneQuery<T> {
  data: T | undefined;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * A query as a section's `PhoneLoad`: its error (the API's words through
 * `getApiError`, Retry refetches, `retrying` while it runs), its data once
 * it has some, else loading.
 */
export function fromQuery<T>(query: PhoneQuery<T>): PhoneLoad<T> {
  if (query.isError) {
    return {
      status: "error",
      message: getApiError((query.error ?? {}) as AxiosError),
      onRetry: () => void query.refetch(),
      retrying: query.isFetching,
    };
  }
  if (query.data === undefined) return { status: "loading" };
  return { status: "ready", data: query.data };
}

/** The same state with its data mapped. */
export function mapLoad<T, R>(
  load: PhoneLoad<T>,
  map: (data: T) => R,
): PhoneLoad<R> {
  return load.status === "ready"
    ? { status: "ready", data: map(load.data) }
    : load;
}

/** Ready once both are: the first error wins, else loading while either is. */
export function bothLoad<A, B>(
  a: PhoneLoad<A>,
  b: PhoneLoad<B>,
): PhoneLoad<[A, B]> {
  if (a.status === "error") return a;
  if (b.status === "error") return b;
  if (a.status === "loading" || b.status === "loading") {
    return { status: "loading" };
  }
  return { status: "ready", data: [a.data, b.data] };
}

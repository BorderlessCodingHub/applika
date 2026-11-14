"use client";

import { useQuery } from "@tanstack/react-query";

import { services } from "@/services/services";
import type {
  FeatureKey,
  FeatureStage,
  MyFeature,
} from "@/services/types/features";

export const MY_FEATURES_QUERY_KEY = ["user", "features"] as const;

const NO_FEATURES: MyFeature[] = [];

/**
 * The caller's features (PRD 0013, `GET /users/me/features`).
 *
 * No long cache (AC2): `staleTime: 0` refetches on every mount — so on every
 * page load — and on window focus, so an admin's change reaches the screens
 * without a deploy. The server enforces it from the next request anyway.
 *
 * A failed call is "no features" (a web deployed before the migration gets a
 * 500): `features` is the last good answer, else empty. Never a toast — the
 * gated screens simply stay hidden.
 *
 * `enabled` lets the protected layout hold the call until the session is
 * confirmed; a disabled query reads as loading, i.e. no features.
 */
export function useMyFeatures(enabled = true) {
  const query = useQuery({
    queryKey: MY_FEATURES_QUERY_KEY,
    queryFn: () => services.features.getMine(),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return {
    features: query.data ?? NO_FEATURES,
    /** True until the first answer (or failure): treat every feature as absent. */
    isLoading: query.isPending,
  };
}

/**
 * Whether the caller has `key`, and its stage. While loading `has` is false,
 * so a gated entry never flashes in before the answer.
 */
export function useHasFeature(key: FeatureKey): {
  has: boolean;
  stage: FeatureStage | null;
  isLoading: boolean;
} {
  const { features, isLoading } = useMyFeatures();
  const feature = features.find((item) => item.key === key);
  return {
    has: Boolean(feature),
    stage: feature?.stage ?? null,
    isLoading,
  };
}

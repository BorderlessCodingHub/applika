"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { NotFoundMessage } from "@/components/layout/not-found-message";
import { useHasFeature } from "@/hooks/use-features";
import type { FeatureKey } from "@/services/types/features";

interface FeatureGateProps {
  feature: FeatureKey;
  /**
   * Mounted only with the feature. Put the gate ABOVE the component that
   * calls the feature's hooks, so no request goes out without it.
   */
  children: ReactNode;
}

/**
 * A gated screen (PRD 0013): the children with the feature, a spinner while
 * the features load, and otherwise the app's own "page not found" — the same
 * words a mistyped URL gets, so the screen never tells the feature exists.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  const { has, isLoading } = useHasFeature(feature);

  if (isLoading) {
    return (
      <div
        role="status"
        data-slot="feature-gate-loading"
        className="flex justify-center py-16 md:py-24"
      >
        <Loader2 aria-hidden className="size-6 animate-spin text-primary" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!has) return <NotFoundMessage variant="shell" />;

  return <>{children}</>;
}

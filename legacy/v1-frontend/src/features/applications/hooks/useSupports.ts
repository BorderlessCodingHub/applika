// src/features/applications/hooks/useSupports.ts
import useSWR, { mutate } from "swr";
import type {
  SupportResponse,
  Platform,
  FeedbackDefinition,
  StepDefinition,
} from "../schemas/supportSchema";

import { fetchSupports } from "../services/supportsService";

/**
 * Centralized hook: returns { supports: { platforms, feedbacks, steps, results }, isLoading, error }
 * - steps: non-strict steps (for adding steps, etc.)
 * - results: strict steps (for finalize actions)
 */
export function useSupports() {
  const { data, error, isLoading } = useSWR<SupportResponse>(
    "/api/supports",
    fetchSupports,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60 * 1000, // <-- correct property name
    }
  );

  const platforms: { id: number; name: string }[] =
    data?.platforms?.map((p) => ({
      id: p.id,
      name: p.name,
    })) ?? [];
  const feedbacks: FeedbackDefinition[] = data?.feedbacks ?? [];
  const allSteps: StepDefinition[] = data?.steps ?? [];

  return {
    supports: {
      platforms,
      feedbacks,
      // steps used in UI for non-strict steps (adding / editing steps)
      steps: allSteps.filter((s) => !s.strict),
      // results are strict steps used for finalization
      results: allSteps.filter((s) => s.strict),
    },
    isLoading,
    error,
  } as const;
}

/** Helper to revalidate supports cache from anywhere */
export async function mutateSupports() {
  await mutate("/api/supports");
}

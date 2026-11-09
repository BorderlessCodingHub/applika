"use client";

import { InsightsScreen } from "@/components/phone/screens/insights-screen";
import { useIsPhone, useLeaveAtDesktop } from "@/hooks/use-is-phone";

/**
 * `/insights`, the fourth tab, exists on phones only: at md and up the
 * dashboard holds the same charts, so the address goes there (PRD 0021 Q9).
 * Below md it is the Insights board (`InsightsScreen`).
 */
export function InsightsPage() {
  const isPhone = useIsPhone();
  useLeaveAtDesktop("/dashboard");

  if (!isPhone) return null;

  return <InsightsScreen />;
}

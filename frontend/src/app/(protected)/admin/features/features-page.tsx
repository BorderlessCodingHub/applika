"use client";

import { FeatureListHeader } from "@/components/admin/feature-header";
import { FeatureTable } from "@/components/admin/feature-table";
import { fromQuery } from "@/components/phone/phone-query-load";
import { AdminFeaturesScreenView } from "@/components/phone/screens/admin-features-screen";
import { useAdminFeatures } from "@/hooks/use-admin";
import { useIsPhone } from "@/hooks/use-is-phone";

/**
 * `/admin/features` (AC1): every feature with its key, name,
 * description, stage, beta-list count, release date and the admin's own
 * access in words. The header and the table are ui-designer components
 * (`feature-header.tsx`, `feature-table.tsx`); a row's name links to
 * `/admin/features/view?key=`.
 */
export function FeaturesPage() {
  const { data, isLoading, isError, isFetching, refetch, error } =
    useAdminFeatures();
  const isPhone = useIsPhone();

  // Below md v3/AdminFeatures (PRD 0022): the same query, one card per
  // feature under the admin header, which heads it "Features".
  if (isPhone) {
    return (
      <AdminFeaturesScreenView
        features={fromQuery({ data, isError, error, isFetching, refetch })}
        refreshing={isFetching && !isLoading && !isError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <FeatureListHeader />
      <FeatureTable
        features={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        isRetrying={isError && isFetching}
        isRefreshing={isFetching && !isLoading && !isError}
      />
    </div>
  );
}

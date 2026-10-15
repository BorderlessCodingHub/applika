"use client";

import { FeatureListHeader } from "@/components/admin/feature-header";
import { FeatureTable } from "@/components/admin/feature-table";
import { useAdminFeatures } from "@/hooks/use-admin";

/**
 * `/admin/features` (KODI-054, AC1): every feature with its key, name,
 * description, stage, beta-list count, release date and the admin's own
 * access in words. The header and the table are ui-designer components
 * (`feature-header.tsx`, `feature-table.tsx`); a row's name links to
 * `/admin/features/view?key=`.
 */
export function FeaturesPage() {
  const { data, isLoading, isError, isFetching, refetch } = useAdminFeatures();

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

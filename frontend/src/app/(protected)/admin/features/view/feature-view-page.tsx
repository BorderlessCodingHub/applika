"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";

import { FeatureAddUserDialog } from "@/components/admin/feature-add-user-dialog";
import { FeatureBetaList } from "@/components/admin/feature-beta-list";
import {
  FeatureHeader,
  FeatureNotFound,
} from "@/components/admin/feature-header";
import { FeatureOwnAccess } from "@/components/admin/feature-own-access";
import { FeatureStageAction } from "@/components/admin/feature-stage-action";
import {
  useAddFeatureUser,
  useAdminFeatureUsers,
  useAdminFeatures,
  useAdminUserSearch,
  useRemoveFeatureUser,
  useSetFeatureOptOut,
  useSetFeatureStage,
} from "@/hooks/use-admin";
import type { FeatureStage } from "@/services/types/features";

/** The beta list's page size (AC2): the API's default. */
export const FEATURE_USERS_PER_PAGE = 25;
/** How long typing settles before a search request goes out. */
export const FEATURE_SEARCH_DEBOUNCE_MS = 250;

/** The server's string `detail`, or `null` (a 5xx body, a network error). */
function serverDetail(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const detail = (error.response?.data as { detail?: unknown } | undefined)
    ?.detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

/**
 * The ui-designer components' promise contract: resolve with nothing on
 * success, with the server's `detail` to show it word for word, reject for
 * anything else (they show their own generic message).
 */
async function detailOrThrow(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const detail = serverDetail(error);
    if (detail) return detail;
    throw error;
  }
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * `/admin/features/view?key=` (KODI-054, AC2-AC11): the feature's header and
 * stage action, the admin's own access, and its beta list with the add-user
 * dialog. Every piece is a ui-designer component (`components/admin/feature-*`);
 * this component owns the queries, the mutations and the search/page state.
 */
export function FeatureViewPage() {
  const searchParams = useSearchParams();
  const featureKey = searchParams.get("key")?.trim() || null;

  const features = useAdminFeatures();
  const feature = features.data?.find((row) => row.key === featureKey);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const listSearch = useDebouncedValue(
    search.trim(),
    FEATURE_SEARCH_DEBOUNCE_MS,
  );
  const users = useAdminFeatureUsers(featureKey, {
    search: listSearch || undefined,
    page,
    per_page: FEATURE_USERS_PER_PAGE,
  });

  const [addSearch, setAddSearch] = useState("");
  const candidateSearch = useDebouncedValue(
    addSearch.trim(),
    FEATURE_SEARCH_DEBOUNCE_MS,
  );
  const candidates = useAdminUserSearch(candidateSearch);
  // `GET /admin/users` has no "already listed" flag: ask the beta list for the
  // same text (it matches usernames; the page on screen covers the rest).
  const listedForSearch = useAdminFeatureUsers(
    candidateSearch ? featureKey : null,
    { search: candidateSearch, per_page: 100 },
  );
  const listedUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const user of listedForSearch.data?.items ?? []) ids.add(user.user_id);
    for (const user of users.data?.items ?? []) ids.add(user.user_id);
    return [...ids];
  }, [listedForSearch.data, users.data]);

  const setStage = useSetFeatureStage();
  const setOptOut = useSetFeatureOptOut();
  const addUser = useAddFeatureUser();
  const removeUser = useRemoveFeatureUser();

  const usersNotFound =
    users.isError &&
    isAxiosError(users.error) &&
    users.error.response?.status === 404;

  if (
    !featureKey ||
    usersNotFound ||
    (features.data !== undefined && !feature)
  ) {
    return (
      <div className="flex flex-col gap-5">
        <FeatureNotFound
          featureKey={featureKey}
          message={usersNotFound ? serverDetail(users.error) : null}
        />
      </div>
    );
  }

  const key = featureKey;
  const headerError = features.isError && !features.data;

  return (
    <div className="flex flex-col gap-5">
      <FeatureHeader
        feature={feature}
        isLoading={features.isLoading}
        isError={headerError}
        onRetry={() => void features.refetch()}
        isRetrying={headerError && features.isFetching}
        action={
          feature ? (
            <FeatureStageAction
              stage={feature.stage}
              featureName={feature.name}
              onConfirm={(next: FeatureStage) =>
                detailOrThrow(() => setStage.mutateAsync({ key, stage: next }))
              }
            />
          ) : null
        }
      />

      {headerError ? null : (
        <FeatureOwnAccess
          stage={feature?.stage}
          me={feature?.me}
          onUseChange={(use) => {
            if (setOptOut.isPending) return;
            setOptOut.mutate({ key, use });
          }}
          pending={setOptOut.isPending}
          pendingValue={
            setOptOut.isPending ? setOptOut.variables?.use : undefined
          }
        />
      )}

      <FeatureBetaList
        featureName={feature?.name ?? key}
        stage={feature?.stage ?? "beta"}
        result={users.data}
        isLoading={users.isLoading}
        isError={users.isError}
        errorMessage={serverDetail(users.error)}
        onRetry={() => void users.refetch()}
        isRetrying={users.isError && users.isFetching}
        isRefreshing={users.isFetching && !users.isLoading && !users.isError}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onPageChange={setPage}
        onRemove={(user) =>
          detailOrThrow(() =>
            removeUser.mutateAsync({ key, userId: user.user_id }),
          )
        }
        action={
          <FeatureAddUserDialog
            featureName={feature?.name ?? key}
            search={addSearch}
            onSearchChange={setAddSearch}
            users={candidateSearch ? candidates.data?.items : undefined}
            total={candidateSearch ? candidates.data?.total : undefined}
            isLoading={candidates.isLoading}
            isError={candidates.isError}
            onRetry={() => void candidates.refetch()}
            isRetrying={candidates.isError && candidates.isFetching}
            isRefreshing={
              (candidates.isFetching && !candidates.isLoading) ||
              (addSearch.trim() !== candidateSearch && !!candidates.data)
            }
            listedUserIds={listedUserIds}
            onAdd={(user) =>
              detailOrThrow(() => addUser.mutateAsync({ key, userId: user.id }))
            }
          />
        }
      />
    </div>
  );
}

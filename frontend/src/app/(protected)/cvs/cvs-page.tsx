"use client";

import { useState } from "react";
import type { AxiosError } from "axios";
import { BaseCvList } from "@/components/base-cvs/base-cv-list";
import { BASE_CVS_MAX } from "@/components/base-cvs/types";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useDeleteBaseCv } from "@/hooks/use-delete-base-cv";
import { getApiError } from "@/lib/api-client";
import type { BaseCv } from "@/services/types/base-cv";

/**
 * `/cvs` — the master CV gallery.
 *
 * `BaseCvList` owns all four states and the delete confirmation; this component
 * owns the queries, the navigation targets and the delete mutation. The create
 * tile disables itself at `BASE_CVS_MAX` and shows the reason on screen — the
 * default copy carries the words "the limit is three", so it is NOT overridden
 * with an API message here.
 *
 * No outer container: `AppShell` already renders the `max-w-6xl` one.
 */
export function CvsPage() {
  const { data: cvs, isLoading, error, refetch } = useBaseCvs();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteMutation = useDeleteBaseCv({
    onSettled: () => setDeletingId(null),
  });

  const handleDelete = (cv: BaseCv) => {
    setDeletingId(cv.id);
    deleteMutation.mutate(cv.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">CVs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your master CVs. Keep up to three and reuse them for every
          application.
        </p>
      </div>

      <BaseCvList
        cvs={cvs}
        isLoading={isLoading}
        error={error ? getApiError(error as AxiosError) : null}
        onRetry={() => void refetch()}
        editHref={(cv) => `/cvs/editor?id=${cv.id}`}
        newHref="/cvs/new"
        onDelete={handleDelete}
        deletingId={deletingId}
        max={BASE_CVS_MAX}
      />
    </div>
  );
}

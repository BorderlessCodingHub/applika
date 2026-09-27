"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { BaseCv, CvFormValues } from "@/components/base-cvs/types";
import { FullWidthContent } from "@/components/layout/content-width";
import { DraftNoMasterCv } from "@/components/application-drafts/draft-page-states";
import { BaseCvPicker } from "@/components/tailored-cvs/base-cv-picker";
import type { CvDiffSnapshot } from "@/components/tailored-cvs/cv-diff";
import { TailoredCvEditor } from "@/components/tailored-cvs/tailored-cv-editor";
import { useCvDiff } from "@/components/tailored-cvs/use-cv-diff";
import type { TailoredCv } from "@/components/tailored-cvs/types";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useDeleteBaseCv } from "@/hooks/use-delete-base-cv";
import { useExportBaseCvMarkdown } from "@/hooks/use-export-base-cv-markdown";
import { useExportBaseCvPdf } from "@/hooks/use-export-base-cv-pdf";
import { safeErrorMessage } from "@/components/application-drafts/draft-copy";

export interface DraftCvStepProps {
  form: UseFormReturn<CvFormValues>;
  /** `undefined` while unknown, `null` when there is no copy yet. */
  cv: TailoredCv | null | undefined;
  isLoadingCv: boolean;
  /** A load failure OTHER than "no copy yet" — a real error to show. */
  cvLoadErrorMessage: string | null;
  onCreate: (baseCvId: string) => void;
  isCreating: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  /** Mounted once a copy exists; renders the whole `<TailoredCvEditor/>` footer. */
  footer: ReactNode;
  onAddJobDescription: () => void;
  jobDescription?: string | null;
}

/**
 * Step 2 of `/applications/new-with-cv` (PRD 0010, KODI-033, T068): the same
 * behaviour as the standalone application CV page (PRD 0007) — full snapshot
 * copy, one copy per application, job description beside the editor, a diff
 * against the master, and a fresh copy from another master after deleting the
 * current one — reused on a DRAFT id (the backend accepts drafts under
 * `/applications/{id}/cv`, per the shipped contract).
 *
 * Purely presentational: the page owns the form, the copy query, the create/
 * delete mutations and the seeding — kept OUT of this component on purpose
 * (KODI-033 QA round 1, B2/B3) because this component switches in and out of
 * the DOM on every step change, and anything it owned as local state or a ref
 * (which copy id it already seeded) would reset on every remount, autosaving
 * `emptyTailoredCvValues()` over a real copy or reverting an unsaved edit the
 * instant the user came back to this step.
 */
export function DraftCvStep({
  form,
  cv,
  isLoadingCv,
  cvLoadErrorMessage,
  onCreate,
  isCreating,
  onDelete,
  isDeleting,
  footer,
  onAddJobDescription,
  jobDescription,
}: DraftCvStepProps) {
  const baseCvs = useBaseCvs();

  const [selectedBaseCvId, setSelectedBaseCvId] = useState<string | null>(null);
  const [deletingBaseCvId, setDeletingBaseCvId] = useState<string | null>(null);
  const [exportingBaseCvId, setExportingBaseCvId] = useState<string | null>(
    null,
  );
  const [exportingBaseCvMarkdownId, setExportingBaseCvMarkdownId] = useState<
    string | null
  >(null);

  const deleteBaseCvMutation = useDeleteBaseCv({
    onSettled: () => setDeletingBaseCvId(null),
  });
  const exportBaseCvMutation = useExportBaseCvPdf();
  const exportBaseCvMarkdownMutation = useExportBaseCvMarkdown();

  const handleDeleteBaseCv = useCallback(
    (baseCv: BaseCv) => {
      setDeletingBaseCvId(baseCv.id);
      deleteBaseCvMutation.mutate(baseCv.id, {
        onSuccess: () => {
          setSelectedBaseCvId((current) =>
            current === baseCv.id ? null : current,
          );
        },
      });
    },
    [deleteBaseCvMutation],
  );

  const handleExportBaseCv = useCallback(
    (baseCv: BaseCv) => {
      setExportingBaseCvId(baseCv.id);
      exportBaseCvMutation.mutate(
        { id: baseCv.id, name: baseCv.name },
        { onSettled: () => setExportingBaseCvId(null) },
      );
    },
    [exportBaseCvMutation],
  );

  const handleExportBaseCvMarkdown = useCallback(
    (baseCv: BaseCv) => {
      setExportingBaseCvMarkdownId(baseCv.id);
      exportBaseCvMarkdownMutation.mutate(
        { id: baseCv.id, name: baseCv.name },
        { onSettled: () => setExportingBaseCvMarkdownId(null) },
      );
    },
    [exportBaseCvMarkdownMutation],
  );

  const handleSelect = useCallback((id: string) => setSelectedBaseCvId(id), []);

  const sourceCvName =
    baseCvs.data?.find((item) => item.id === cv?.base_cv_id)?.name ?? null;

  const baselineSnapshot: CvDiffSnapshot | null = useMemo(() => {
    if (!cv) return null;
    if (cv.base_snapshot) return cv.base_snapshot;
    if (cv.base_cv_id) {
      const master = baseCvs.data?.find((item) => item.id === cv.base_cv_id);
      if (master) return master;
    }
    return null;
  }, [cv, baseCvs.data]);

  const cvDiff = useCvDiff({
    form,
    baseline: baselineSnapshot,
    baselineLabel: sourceCvName,
    readOnly: false,
  });

  if (cvLoadErrorMessage) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {cvLoadErrorMessage}
      </p>
    );
  }

  if (isLoadingCv) {
    return null;
  }

  if (!cv) {
    if (baseCvs.data && baseCvs.data.length === 0 && !baseCvs.isLoading) {
      return <DraftNoMasterCv />;
    }
    return (
      <BaseCvPicker
        options={baseCvs.data}
        isLoading={baseCvs.isLoading}
        error={baseCvs.error ? safeErrorMessage(baseCvs.error) : null}
        onRetry={() => void baseCvs.refetch()}
        value={selectedBaseCvId}
        onValueChange={handleSelect}
        onCreate={() => {
          if (selectedBaseCvId) onCreate(selectedBaseCvId);
        }}
        isCreating={isCreating}
        onDelete={handleDeleteBaseCv}
        deletingId={deletingBaseCvId}
        onExport={handleExportBaseCv}
        exportingId={exportingBaseCvId}
        onExportMarkdown={handleExportBaseCvMarkdown}
        exportingMarkdownId={exportingBaseCvMarkdownId}
      />
    );
  }

  return (
    <>
      <FullWidthContent />
      <TailoredCvEditor
        form={form}
        onSubmit={(event) => event.preventDefault()}
        baseCvId={cv.base_cv_id}
        sourceCvName={sourceCvName}
        jobDescription={jobDescription}
        onAddJobDescription={onAddJobDescription}
        onDelete={onDelete}
        isDeleting={isDeleting}
        diffSummary={cvDiff.diffSummary}
        diff={cvDiff.slots}
        footerEnd={footer}
      />
    </>
  );
}

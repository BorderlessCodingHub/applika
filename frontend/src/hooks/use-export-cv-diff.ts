"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import {
  cvDiffMarkdownFilename,
  cvDiffPdfFilename,
  downloadBlob,
} from "@/lib/pdf-download";
import { services } from "@/services/services";

export interface UseExportCvDiffOptions {
  /**
   * Fired ONLY on a 409 ("This CV copy has no baseline to compare with."),
   * with the server's own message, so the caller can disable the download row
   * WITH that reason on screen, beside the toast. Every OTHER failure (a
   * transient 500, a network error) reaches the user through the toast alone
   * — it must not leave the row disabled after one bad request, since nothing
   * ever calls this back to clear it.
   */
  onNoBaseline?: (message: string) => void;
}

/**
 * Download the diff between a CV copy and its baseline as Markdown
 * (KODI-017 part 3): `GET /applications/{id}/cv/diff/markdown`, rendered on
 * the server from the SAVED copy — not the form's unsaved edits.
 */
export function useExportCvDiffMarkdown(
  applicationId: string,
  cvName: string,
  options: UseExportCvDiffOptions = {},
) {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } =
        await services.tailoredCvs.exportDiffMarkdown(applicationId);
      downloadBlob(blob, filename ?? cvDiffMarkdownFilename(cvName));
    },
    onError: async (error: AxiosError) => {
      const message = await getBlobApiError(error);
      if (error.response?.status === 409) options.onNoBaseline?.(message);
      toast.error(message);
    },
  });
}

/** The same diff, typeset as a PDF: `GET /applications/{id}/cv/diff/pdf`. */
export function useExportCvDiffPdf(
  applicationId: string,
  cvName: string,
  options: UseExportCvDiffOptions = {},
) {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } =
        await services.tailoredCvs.exportDiffPdf(applicationId);
      downloadBlob(blob, filename ?? cvDiffPdfFilename(cvName));
    },
    onError: async (error: AxiosError) => {
      const message = await getBlobApiError(error);
      if (error.response?.status === 409) options.onNoBaseline?.(message);
      toast.error(message);
    },
  });
}

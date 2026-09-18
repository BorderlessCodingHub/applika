"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import { cvPdfFilename, downloadBlob } from "@/lib/pdf-download";
import { services } from "@/services/services";

/**
 * Download the server-rendered PDF of an application's CV copy (ADR 0011).
 *
 * Keyed by the APPLICATION id, like every other CV-copy call — there is no copy
 * id to address. Unlike the write hooks it works on a finalized or archived
 * application: the route carries no guard, because reading and downloading a
 * locked copy is exactly what the copy is still for.
 *
 * Invalidates nothing (a download changes no row) and raises no success toast
 * (the browser and the button's live region already say it); see
 * `use-export-base-cv-pdf.ts`.
 */
export function useExportTailoredCvPdf(applicationId: string, cvName: string) {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } =
        await services.tailoredCvs.exportPdf(applicationId);
      downloadBlob(blob, filename ?? cvPdfFilename(cvName));
    },
    onError: async (error: AxiosError) =>
      toast.error(await getBlobApiError(error)),
  });
}

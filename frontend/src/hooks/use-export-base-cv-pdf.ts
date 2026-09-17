"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import { cvPdfFilename, downloadBlob } from "@/lib/pdf-download";
import { services } from "@/services/services";

/**
 * Download the server-rendered PDF of one master CV (ADR 0011).
 *
 * A mutation rather than a query because the render is work the server does on
 * demand and the result is never cached — and for the same reason this
 * invalidates NOTHING: a download changes no row.
 *
 * `cvName` only feeds the fallback filename for the case where
 * `Content-Disposition` did not reach the browser; the server's own name wins
 * whenever it is readable.
 *
 * There is no success toast on purpose. The browser announces the finished
 * download itself, and `ExportCvButton` already announces the pending render in
 * its live region; a third notice would be noise on the one action whose
 * outcome the user cannot miss.
 */
export function useExportBaseCvPdf(id: string, cvName: string) {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await services.baseCvs.exportPdf(id);
      downloadBlob(blob, filename ?? cvPdfFilename(cvName));
    },
    onError: async (error: AxiosError) =>
      toast.error(await getBlobApiError(error)),
  });
}

"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import { cvPdfFilename, downloadBlob } from "@/lib/pdf-download";
import { services } from "@/services/services";

/** Which CV to render, named at CALL time rather than at hook-creation time. */
export interface ExportBaseCvPdfVariables {
  /** The master CV's id — the `{id}` of the existing `/base-cvs/{id}/pdf` route. */
  id: string;
  /**
   * Only feeds the fallback filename for the case where `Content-Disposition`
   * did not reach the browser; the server's own name wins whenever it is
   * readable.
   */
  name: string;
}

/**
 * Download the server-rendered PDF of one master CV (ADR 0011).
 *
 * A mutation rather than a query because the render is work the server does on
 * demand and the result is never cached — and for the same reason this
 * invalidates NOTHING: a download changes no row.
 *
 * The id and the name are MUTATION VARIABLES, not hook arguments (KODI-009).
 * `/cvs` renders up to `BASE_CVS_MAX` tiles and each needs the same download,
 * and a hook cannot be called in a loop; binding the CV at creation time would
 * have forced a second export path per row. One hook instance per surface, the
 * CV named per press, and the same
 * `services.baseCvs.exportPdf` -> `downloadBlob`/`cvPdfFilename` ->
 * `getBlobApiError` chain behind every press.
 *
 * There is no success toast on purpose. The browser announces the finished
 * download itself, and `ExportCvButton` already announces the pending render in
 * its live region; a third notice would be noise on the one action whose
 * outcome the user cannot miss.
 */
export function useExportBaseCvPdf() {
  return useMutation({
    mutationFn: async ({ id, name }: ExportBaseCvPdfVariables) => {
      const { blob, filename } = await services.baseCvs.exportPdf(id);
      downloadBlob(blob, filename ?? cvPdfFilename(name));
    },
    onError: async (error: AxiosError) =>
      toast.error(await getBlobApiError(error)),
  });
}

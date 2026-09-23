"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import { cvMarkdownFilename, downloadBlob } from "@/lib/pdf-download";
import { services } from "@/services/services";

/**
 * Download the server-rendered Markdown of an application's CV copy
 * (KODI-017 part 3, ADR 0011). The Markdown twin of `useExportTailoredCvPdf`:
 * keyed by the application id, carries no finalized/archived guard (reading
 * and downloading a locked copy is exactly what it is still for), invalidates
 * nothing and raises no success toast.
 */
export function useExportTailoredCvMarkdown(
  applicationId: string,
  cvName: string,
) {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } =
        await services.tailoredCvs.exportMarkdown(applicationId);
      downloadBlob(blob, filename ?? cvMarkdownFilename(cvName));
    },
    onError: async (error: AxiosError) =>
      toast.error(await getBlobApiError(error)),
  });
}

"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import { getBlobApiError } from "@/lib/blob-error";
import { cvMarkdownFilename, downloadBlob } from "@/lib/pdf-download";
import { services } from "@/services/services";

/** Which CV to render, named at CALL time — see `use-export-base-cv-pdf.ts`. */
export interface ExportBaseCvMarkdownVariables {
  id: string;
  name: string;
}

/**
 * Download the server-rendered Markdown of one master CV (KODI-017 part 3,
 * ADR 0011). The Markdown twin of `useExportBaseCvPdf`: same mutation-
 * variables shape (one hook per gallery, the CV named at press time), same
 * "no invalidation, no success toast" contract — a download changes no row
 * and the browser/live-region already announce it.
 */
export function useExportBaseCvMarkdown() {
  return useMutation({
    mutationFn: async ({ id, name }: ExportBaseCvMarkdownVariables) => {
      const { blob, filename } = await services.baseCvs.exportMarkdown(id);
      downloadBlob(blob, filename ?? cvMarkdownFilename(name));
    },
    onError: async (error: AxiosError) =>
      toast.error(await getBlobApiError(error)),
  });
}

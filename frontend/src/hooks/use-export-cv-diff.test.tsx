import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useExportCvDiffMarkdown,
  useExportCvDiffPdf,
} from "@/hooks/use-export-cv-diff";
import { TailoredCvService } from "@/services/implementations/tailored-cv-service";

/**
 * The wire contract of the "Download changes" export (KODI-017 part 3):
 * `GET /applications/{id}/cv/diff/{markdown|pdf}`, blob response, the
 * `-changes` filename suffix, and — the one rule this hook adds beyond the
 * plain CV exports — `onNoBaseline` fires ONLY on a 409. A transient 500 must
 * reach the user through the toast alone, never through the disabled-with-a-
 * reason path, since nothing ever calls it back to clear that reason.
 */

const get = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const APPLICATION_ID = "42";
const MARKDOWN = new Blob(["# Changes\n"], { type: "text/markdown" });
const PDF = new Blob(["%PDF-1.7"], { type: "application/pdf" });

const createObjectURL = vi.fn(() => "blob:applika/diff");
const revokeObjectURL = vi.fn();
let saved: Array<{ download: string }> = [];

function response(blob: Blob, contentDisposition?: string) {
  return {
    data: blob,
    headers: contentDisposition
      ? { "content-disposition": contentDisposition }
      : {},
  };
}

function blobError(status: number, detail: unknown) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: new Blob([JSON.stringify({ detail })], {
        type: "application/json",
      }),
    },
  };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  saved = [];
  URL.createObjectURL =
    createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ download: this.download });
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.restoreAllMocks();
});

describe("the diff Markdown export", () => {
  it("GETs the diff/markdown route with a blob response", async () => {
    get.mockResolvedValue(
      response(MARKDOWN, 'attachment; filename="backend-cv-changes.md"'),
    );
    const { result } = renderHook(
      () => useExportCvDiffMarkdown(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/applications/42/cv/diff/markdown", {
      responseType: "blob",
    });
    await waitFor(() =>
      expect(saved).toEqual([{ download: "backend-cv-changes.md" }]),
    );
  });

  it("falls back to '<slug>-changes.md' when the header is missing", async () => {
    get.mockResolvedValue(response(MARKDOWN));
    const { result } = renderHook(
      () => useExportCvDiffMarkdown(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(saved).toEqual([{ download: "backend-cv-changes.md" }]),
    );
  });

  it("fires onNoBaseline with the server's words on a 409, and disables nothing else", async () => {
    get.mockRejectedValue(
      blobError(409, "This CV copy has no baseline to compare with."),
    );
    const onNoBaseline = vi.fn();
    const { result } = renderHook(
      () =>
        useExportCvDiffMarkdown(APPLICATION_ID, "Backend CV", {
          onNoBaseline,
        }),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(onNoBaseline).toHaveBeenCalledWith(
        "This CV copy has no baseline to compare with.",
      ),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "This CV copy has no baseline to compare with.",
    );
  });

  it("does NOT fire onNoBaseline on a transient failure — only the toast", async () => {
    get.mockRejectedValue(blobError(500, "Render failed"));
    const onNoBaseline = vi.fn();
    const { result } = renderHook(
      () =>
        useExportCvDiffMarkdown(APPLICATION_ID, "Backend CV", {
          onNoBaseline,
        }),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Render failed"),
    );
    expect(onNoBaseline).not.toHaveBeenCalled();
  });
});

describe("the diff PDF export", () => {
  it("GETs the diff/pdf route with a blob response and the -changes filename", async () => {
    get.mockResolvedValue(
      response(PDF, 'attachment; filename="backend-cv-changes.pdf"'),
    );
    const { result } = renderHook(
      () => useExportCvDiffPdf(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/applications/42/cv/diff/pdf", {
      responseType: "blob",
    });
    await waitFor(() =>
      expect(saved).toEqual([{ download: "backend-cv-changes.pdf" }]),
    );
  });

  it("fires onNoBaseline only on a 409", async () => {
    get.mockRejectedValue(
      blobError(409, "This CV copy has no baseline to compare with."),
    );
    const onNoBaseline = vi.fn();
    const { result } = renderHook(
      () => useExportCvDiffPdf(APPLICATION_ID, "Backend CV", { onNoBaseline }),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(onNoBaseline).toHaveBeenCalledWith(
        "This CV copy has no baseline to compare with.",
      ),
    );
  });
});

describe("the service behind them", () => {
  it("reads the filename off Content-Disposition, or reports none", async () => {
    get.mockResolvedValue(response(MARKDOWN, 'attachment; filename="x.md"'));
    await expect(
      new TailoredCvService().exportDiffMarkdown("42"),
    ).resolves.toEqual({ blob: MARKDOWN, filename: "x.md" });

    get.mockResolvedValue(response(PDF));
    await expect(new TailoredCvService().exportDiffPdf("42")).resolves.toEqual({
      blob: PDF,
      filename: null,
    });
  });
});

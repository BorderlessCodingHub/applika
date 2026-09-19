import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExportBaseCvMarkdown } from "@/hooks/use-export-base-cv-markdown";
import { useExportTailoredCvMarkdown } from "@/hooks/use-export-tailored-cv-markdown";
import { BaseCvService } from "@/services/implementations/base-cv-service";
import { TailoredCvService } from "@/services/implementations/tailored-cv-service";

/**
 * The wire contract of the Markdown export (KODI-017 part 3), the Markdown
 * twin of `use-export-cv-pdf.test.tsx`: a `GET` (never `POST` — nothing is
 * rendered on demand from a body, it is a plain read of the stored CV) with
 * `responseType: "blob"`, the server's filename winning over the mirrored
 * slug fallback, and a blob error read back before it reaches the toast.
 */

const get = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BASE_CV_ID = "7";
const APPLICATION_ID = "42";
const MARKDOWN = new Blob(["# Backend CV\n"], { type: "text/markdown" });

const createObjectURL = vi.fn(() => "blob:applika/markdown");
const revokeObjectURL = vi.fn();
let saved: Array<{ download: string; href: string }> = [];

function markdownResponse(contentDisposition?: string) {
  return {
    data: MARKDOWN,
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
  get.mockResolvedValue(
    markdownResponse('attachment; filename="backend-cv.md"'),
  );
  URL.createObjectURL =
    createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.restoreAllMocks();
});

describe("the master CV Markdown export", () => {
  it("GETs the markdown route with a blob response", async () => {
    const { result } = renderHook(() => useExportBaseCvMarkdown(), {
      wrapper: wrapper(),
    });

    result.current.mutate({ id: BASE_CV_ID, name: "Backend CV" });

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/base-cvs/7/markdown", {
      responseType: "blob",
    });
  });

  it("saves the bytes under the name the server chose", async () => {
    const { result } = renderHook(() => useExportBaseCvMarkdown(), {
      wrapper: wrapper(),
    });

    result.current.mutate({ id: BASE_CV_ID, name: "Something else entirely" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      download: "backend-cv.md",
      href: "blob:applika/markdown",
    });
  });

  it("falls back to the CV's own slug, with .md, when the header does not arrive", async () => {
    get.mockResolvedValue(markdownResponse());
    const { result } = renderHook(() => useExportBaseCvMarkdown(), {
      wrapper: wrapper(),
    });

    result.current.mutate({ id: BASE_CV_ID, name: "CV — 2026 (final)" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("cv-2026-final.md");
  });

  it("shows the server's own words when the render fails", async () => {
    get.mockRejectedValue(blobError(500, "Could not render the Markdown"));
    const { result } = renderHook(() => useExportBaseCvMarkdown(), {
      wrapper: wrapper(),
    });

    result.current.mutate({ id: BASE_CV_ID, name: "Backend CV" });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not render the Markdown"),
    );
    expect(saved).toHaveLength(0);
  });
});

describe("the CV copy Markdown export", () => {
  it("GETs the application-keyed markdown route with a blob response", async () => {
    const { result } = renderHook(
      () => useExportTailoredCvMarkdown(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/applications/42/cv/markdown", {
      responseType: "blob",
    });
  });

  it("downloads a locked copy just like any other", async () => {
    const { result } = renderHook(
      () => useExportTailoredCvMarkdown(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("backend-cv.md");
  });
});

describe("the services behind them", () => {
  it("read the filename off Content-Disposition, or report none", async () => {
    get.mockResolvedValue(
      markdownResponse('attachment; filename="backend-cv.md"'),
    );
    await expect(new BaseCvService().exportMarkdown("7")).resolves.toEqual({
      blob: MARKDOWN,
      filename: "backend-cv.md",
    });

    get.mockResolvedValue(markdownResponse());
    await expect(new TailoredCvService().exportMarkdown("42")).resolves.toEqual(
      { blob: MARKDOWN, filename: null },
    );
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExportBaseCvPdf } from "@/hooks/use-export-base-cv-pdf";
import { useExportTailoredCvPdf } from "@/hooks/use-export-tailored-cv-pdf";
import { BaseCvService } from "@/services/implementations/base-cv-service";
import { TailoredCvService } from "@/services/implementations/tailored-cv-service";

/**
 * The wire contract of the PDF export (KODI-004 / ADR 0011).
 *
 * Asserted against the MOCKED AXIOS INSTANCE rather than against the service
 * class, so what is pinned is what actually leaves the browser: the verb, the
 * URL, the empty body, and `responseType: "blob"`. `getBlobApiError` is the
 * REAL one — it is the whole point of this suite's error half.
 *
 * Three rules live here:
 *
 * - no request body and no theme parameter. The theme is fixed `applika`
 *   server-side and the user does not choose it (AC2);
 * - the filename is the SERVER's, read off `Content-Disposition`; the mirrored
 *   slug is only the fallback for a header that did not survive the trip;
 * - a failed render must reach the user as the server's own `detail`. With
 *   `responseType: "blob"` axios hands the ERROR body back as a `Blob` too, so
 *   `getApiError` would put the string "undefined" in the toast. The bytes are
 *   read back first.
 */

const post = vi.fn();

// Replaced outright, never `importOriginal`: the real `api-client` imports the
// service container, which imports the services back — resolving it from inside
// the factory hands the services the REAL axios and the mock silently does
// nothing. `getBlobApiError` lives in `@/lib/blob-error` for the same reason and
// is the real one here.
vi.mock("@/lib/api-client", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// `@/services/services` is NOT mocked: the real container holds the real
// service classes, which reach the mocked `api` above. So the hook, the
// service and the header parsing are all exercised as one path.

const BASE_CV_ID = "7";
const APPLICATION_ID = "42";
const PDF = new Blob(["%PDF-1.7\n…"], { type: "application/pdf" });

const createObjectURL = vi.fn(() => "blob:applika/pdf");
const revokeObjectURL = vi.fn();

/** The last `<a download>` the helper clicked, as name and href. */
let saved: Array<{ download: string; href: string }> = [];

function pdfResponse(contentDisposition?: string) {
  return {
    data: PDF,
    headers: contentDisposition
      ? { "content-disposition": contentDisposition }
      : {},
  };
}

/** A FastAPI error as it really arrives on a `responseType: "blob"` request. */
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
  post.mockResolvedValue(pdfResponse('attachment; filename="backend-cv.pdf"'));
  // Assign onto the real `URL` rather than replacing it: jsdom has no
  // `createObjectURL`, but axios needs `new URL(...)` to keep working.
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

describe("the master CV export", () => {
  it("POSTs the pdf route with no body, no theme and a blob response", async () => {
    const { result } = renderHook(
      () => useExportBaseCvPdf(BASE_CV_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/base-cvs/7/pdf", undefined, {
      responseType: "blob",
    });
  });

  it("saves the bytes under the name the server chose", async () => {
    const { result } = renderHook(
      () => useExportBaseCvPdf(BASE_CV_ID, "Something else entirely"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      download: "backend-cv.pdf",
      href: "blob:applika/pdf",
    });
    expect(createObjectURL).toHaveBeenCalledWith(PDF);
  });

  it("falls back to the CV's own slug when the header does not arrive", async () => {
    post.mockResolvedValue(pdfResponse());
    const { result } = renderHook(
      () => useExportBaseCvPdf(BASE_CV_ID, "CV — 2026 (final)"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("cv-2026-final.pdf");
  });

  it("shows the server's own words when the render fails, not 'undefined'", async () => {
    post.mockRejectedValue(blobError(500, "Could not render the PDF"));
    const { result } = renderHook(
      () => useExportBaseCvPdf(BASE_CV_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not render the PDF"),
    );
    expect(saved).toHaveLength(0);
  });

  it("never puts a 422 detail array on screen", async () => {
    post.mockRejectedValue(blobError(422, [{ loc: ["body"], msg: "nope" }]));
    const { result } = renderHook(
      () => useExportBaseCvPdf(BASE_CV_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Something went wrong"),
    );
  });
});

describe("the CV copy export", () => {
  it("POSTs the application-keyed pdf route with no body and a blob response", async () => {
    const { result } = renderHook(
      () => useExportTailoredCvPdf(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/applications/42/cv/pdf", undefined, {
      responseType: "blob",
    });
  });

  it("downloads a locked copy just like any other (AC1)", async () => {
    const { result } = renderHook(
      () => useExportTailoredCvPdf(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    // Nothing in the hook or the service knows or asks whether the application
    // is finalized: the route carries no guard, so there is none to mirror.
    result.current.mutate();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("backend-cv.pdf");
  });

  it("shows the server's own words when the copy is gone", async () => {
    post.mockRejectedValue(blobError(404, "CV copy not found"));
    const { result } = renderHook(
      () => useExportTailoredCvPdf(APPLICATION_ID, "Backend CV"),
      { wrapper: wrapper() },
    );

    result.current.mutate();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("CV copy not found"),
    );
  });
});

describe("the services behind them", () => {
  it("read the filename off Content-Disposition, or report none", async () => {
    post.mockResolvedValue(
      pdfResponse('attachment; filename="backend-cv.pdf"'),
    );
    await expect(new BaseCvService().exportPdf("7")).resolves.toEqual({
      blob: PDF,
      filename: "backend-cv.pdf",
    });

    post.mockResolvedValue(pdfResponse());
    await expect(new TailoredCvService().exportPdf("42")).resolves.toEqual({
      blob: PDF,
      filename: null,
    });
  });
});

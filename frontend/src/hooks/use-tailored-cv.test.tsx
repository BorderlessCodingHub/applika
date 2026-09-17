import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useCreateTailoredCv } from "@/hooks/use-create-tailored-cv";
import { useDeleteTailoredCv } from "@/hooks/use-delete-tailored-cv";
import { isNoTailoredCv, useTailoredCv } from "@/hooks/use-tailored-cv";
import { useUpdateTailoredCv } from "@/hooks/use-update-tailored-cv";
import type { UpdateTailoredCvPayload } from "@/services/types/tailored-cv";

/**
 * The wire contract of the CV-copy hooks (KODI-003).
 *
 * Everything here is asserted against the MOCKED AXIOS INSTANCE rather than
 * against the service class, so the test pins what actually leaves the browser:
 * the verb, the URL and the body. If the backend's routes move, this suite is
 * what fails.
 *
 * It also pins the one rule that shapes the whole page: a 404 from
 * `GET /applications/{id}/cv` means "no copy yet", so it must be told apart
 * from a real failure rather than read as one.
 */

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
  },
  getApiError: (error: { response?: { data?: { detail?: string } } }): string =>
    error?.response?.data?.detail ?? "Something went wrong",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const APPLICATION_ID = "42";

const COPY = {
  id: "9001",
  application_id: APPLICATION_ID,
  base_cv_id: "7",
  was_ai_generated: false,
  adjustments: [],
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Eight years on payment systems.",
  links: [],
  skills: [
    { id: "s-1", category: "Languages and frameworks", keywords: ["Python"] },
  ],
  education: [],
  experience: [],
  projects: [],
  certifications: [],
  languages: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const WRITABLE: UpdateTailoredCvPayload = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Tailored to the posting.",
  links: [],
  skills: [
    { id: "s-1", category: "Languages and frameworks", keywords: ["Python"] },
  ],
  education: [],
  experience: [],
  projects: [],
  certifications: [],
  languages: [],
};

/** The API's real answer when the application has no copy. */
function notFound() {
  return {
    isAxiosError: true,
    response: { status: 404, data: { detail: "CV copy not found" } },
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
  get.mockResolvedValue({ data: COPY });
  post.mockResolvedValue({ data: COPY });
  put.mockResolvedValue({ data: COPY });
  del.mockResolvedValue({ data: undefined });
});

describe("the CV copy hooks", () => {
  it("reads the copy from GET /applications/{id}/cv", async () => {
    const { result } = renderHook(() => useTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(COPY));
    expect(get).toHaveBeenCalledWith("/applications/42/cv");
  });

  it("asks for nothing until an application id is known", () => {
    renderHook(() => useTailoredCv(null), { wrapper: wrapper() });
    expect(get).not.toHaveBeenCalled();
  });

  it("treats a 404 as 'no copy yet'", async () => {
    get.mockRejectedValue(notFound());
    const { result } = renderHook(() => useTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isNoTailoredCv(result.current.error)).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not mistake a real failure for 'no copy yet'", async () => {
    get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { detail: "boom" } },
    });
    const { result } = renderHook(() => useTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isNoTailoredCv(result.current.error)).toBe(false);
  });

  it("creates the copy with POST and the chosen master CV as the only field", async () => {
    const { result } = renderHook(() => useCreateTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    result.current.mutate("7");

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/applications/42/cv", {
      base_cv_id: "7",
    });
  });

  it("saves the copy with PUT and the full editable field set", async () => {
    const { result } = renderHook(() => useUpdateTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    result.current.mutate(WRITABLE);

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/applications/42/cv");
    expect(body).toEqual(WRITABLE);
    // Server-owned and provenance fields are rejected by the API (`extra=forbid`).
    for (const field of [
      "id",
      "application_id",
      "base_cv_id",
      "was_ai_generated",
      "adjustments",
      "created_at",
      "updated_at",
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("deletes the copy with DELETE", async () => {
    const { result } = renderHook(() => useDeleteTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del).toHaveBeenCalledWith("/applications/42/cv");
  });

  it("shows the server's own words when a write is refused (AC10)", async () => {
    put.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "This application has already been finalized" },
      },
    });
    const { result } = renderHook(() => useUpdateTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    result.current.mutate(WRITABLE);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This application has already been finalized",
      ),
    );
  });

  it("shows the server's own words when a closed cycle refuses a delete (AC10)", async () => {
    del.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: { detail: "Cannot modify an application from an archived cycle" },
      },
    });
    const { result } = renderHook(() => useDeleteTailoredCv(APPLICATION_ID), {
      wrapper: wrapper(),
    });

    result.current.mutate();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Cannot modify an application from an archived cycle",
      ),
    );
  });
});

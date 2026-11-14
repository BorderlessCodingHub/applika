import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useDeleteBaseCv } from "@/hooks/use-delete-base-cv";
import { useUpdateTailoredCv } from "@/hooks/use-update-tailored-cv";
import { loadMessages } from "@/i18n/load-messages";
import { setTranslatorLocale } from "@/i18n/translator";

/** The CV hooks' toasts follow the active language (read at call time). */

vi.mock("@/services/services", () => ({
  services: {
    baseCvs: { remove: vi.fn(() => Promise.resolve()) },
    tailoredCvs: { update: vi.fn(() => Promise.resolve({ id: "t1" })) },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("CV hook toasts", () => {
  it("says a master CV was deleted in English by default", async () => {
    const { result } = renderHook(() => useDeleteBaseCv(), { wrapper });
    act(() => result.current.mutate("cv-1"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Master CV deleted"),
    );
  });

  it("says a master CV was deleted in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    const { result } = renderHook(() => useDeleteBaseCv(), { wrapper });
    act(() => result.current.mutate("cv-1"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("CV principal excluído"),
    );
  });

  it("says a CV copy was saved in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    const { result } = renderHook(() => useUpdateTailoredCv("app-1"), {
      wrapper,
    });
    act(() =>
      result.current.mutate({} as Parameters<typeof result.current.mutate>[0]),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Cópia do CV salva"),
    );
  });
});

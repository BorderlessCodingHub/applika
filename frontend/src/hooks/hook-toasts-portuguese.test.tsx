import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useDeleteCycle } from "@/hooks/use-cycles";
import { useRevokeOtherSessions } from "@/hooks/use-sessions";
import { loadMessages } from "@/i18n/load-messages";
import { setTranslatorLocale } from "@/i18n/translator";

/** Hook toasts follow the active language (read at call time through `word`). */

vi.mock("@/services/services", () => ({
  services: {
    cycles: { deleteCycle: vi.fn(() => Promise.resolve()) },
    sessions: { revokeOthers: vi.fn(() => Promise.reject(new Error("x"))) },
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

describe("hook toasts in Portuguese", () => {
  it("says a cycle was deleted in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    const { result } = renderHook(() => useDeleteCycle(), { wrapper });

    act(() => result.current.mutate("c1"));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Ciclo excluído permanentemente",
      ),
    );
  });

  it("says a revoke failed in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    const { result } = renderHook(() => useRevokeOtherSessions(), { wrapper });

    act(() => result.current.mutate());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível revogar o dispositivo",
      ),
    );
  });
});

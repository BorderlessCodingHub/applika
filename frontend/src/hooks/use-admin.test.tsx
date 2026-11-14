import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCreateAdminCompany,
  useCreateAdminPlatform,
  useDeleteAdminCompany,
  useDeleteAdminPlatform,
  useDeleteReportWebhook,
  useUpdateAdminCompany,
  useUpdateAdminPlatform,
  type AdminMutationOptions,
} from "@/hooks/use-admin";

/**
 * A refused admin Add, Edit or Delete: the desktop toasts the server's
 * words; below md the pages pass `toastError: false`, because their sheets
 * show the same words in place (said once, never twice).
 */

const REFUSAL = {
  isAxiosError: true,
  response: { status: 409, data: { detail: "That name is taken." } },
};

const refuse = vi.fn(() => Promise.reject(REFUSAL));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      createCompany: () => refuse(),
      updateCompany: () => refuse(),
      deleteCompany: () => refuse(),
      createPlatform: () => refuse(),
      updatePlatform: () => refuse(),
      deletePlatform: () => refuse(),
      deleteReportWebhook: () => refuse(),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

type Run = (options?: AdminMutationOptions) => () => Promise<unknown>;

const HOOKS: Array<[string, Run]> = [
  [
    "Add company",
    (options) => {
      const { result } = renderHook(() => useCreateAdminCompany(options), {
        wrapper,
      });
      return () =>
        result.current.mutateAsync({ name: "Acme", url: "https://a.example" });
    },
  ],
  [
    "Edit company",
    (options) => {
      const { result } = renderHook(() => useUpdateAdminCompany(options), {
        wrapper,
      });
      return () =>
        result.current.mutateAsync({ id: "c1", data: { name: "Acme" } });
    },
  ],
  [
    "Delete company",
    (options) => {
      const { result } = renderHook(() => useDeleteAdminCompany(options), {
        wrapper,
      });
      return () => result.current.mutateAsync("c1");
    },
  ],
  [
    "Add platform",
    (options) => {
      const { result } = renderHook(() => useCreateAdminPlatform(options), {
        wrapper,
      });
      return () => result.current.mutateAsync({ name: "Board" });
    },
  ],
  [
    "Edit platform",
    (options) => {
      const { result } = renderHook(() => useUpdateAdminPlatform(options), {
        wrapper,
      });
      return () =>
        result.current.mutateAsync({ id: "p1", data: { name: "Board" } });
    },
  ],
  [
    "Delete platform",
    (options) => {
      const { result } = renderHook(() => useDeleteAdminPlatform(options), {
        wrapper,
      });
      return () => result.current.mutateAsync("p1");
    },
  ],
  [
    "Delete report webhook",
    (options) => {
      const { result } = renderHook(() => useDeleteReportWebhook(options), {
        wrapper,
      });
      return () => result.current.mutateAsync("w1");
    },
  ],
];

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  refuse.mockClear();
});

describe("admin mutations: a refusal", () => {
  it.each(HOOKS)("%s toasts the server's words by default", async (_, run) => {
    const mutate = run();
    await act(async () => {
      await expect(mutate()).rejects.toBe(REFUSAL);
    });

    expect(refuse).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("That name is taken.");
  });

  it.each(HOOKS)(
    "%s leaves the refusal to its caller with toastError: false",
    async (_, run) => {
      const mutate = run({ toastError: false });
      await act(async () => {
        await expect(mutate()).rejects.toBe(REFUSAL);
      });

      expect(refuse).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
});

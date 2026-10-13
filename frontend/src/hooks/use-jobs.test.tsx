import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateBaseCv } from "./use-create-base-cv";
import { useDeleteBaseCv } from "./use-delete-base-cv";
import { useUpdateBaseCv } from "./use-update-base-cv";
import { useDismissJob, useStartApplicationFromJob } from "./use-jobs";
import { makeJob, makePage } from "@/components/jobs/job-test-fixtures";
import { DEFAULT_JOB_FILTERS } from "@/services/types/jobs";
import type { CreateBaseCvPayload } from "@/services/types/base-cv";

/** T080: cache keys and invalidation (AC6 / R-016 web half, AC10, AC11). */

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const dismiss = vi.fn();
const createFromJob = vi.fn();
const toastError = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    baseCvs: {
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      remove: (...args: unknown[]) => remove(...args),
    },
    jobs: {
      dismiss: (...args: unknown[]) => dismiss(...args),
      list: vi.fn(),
      get: vi.fn(),
    },
    applicationDrafts: {
      createFromJob: (...args: unknown[]) => createFromJob(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidatedKeys = () =>
    invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { client, wrapper, invalidatedKeys };
}

beforeEach(() => {
  for (const fn of [
    create,
    update,
    remove,
    dismiss,
    createFromJob,
    toastError,
  ]) {
    fn.mockReset();
  }
  create.mockResolvedValue({ id: "7" });
  update.mockResolvedValue({ id: "7" });
  remove.mockResolvedValue(undefined);
  dismiss.mockResolvedValue(undefined);
  createFromJob.mockResolvedValue({ id: "555" });
});

describe("master CV writes refresh every job's fit (AC6, Plan corrections 14)", () => {
  type Wrapper = ({ children }: { children: ReactNode }) => ReactNode;
  const cases: [string, (wrapper: Wrapper) => Promise<void>][] = [
    [
      "create",
      async (wrapper) => {
        const { result } = renderHook(() => useCreateBaseCv(), { wrapper });
        await act(async () => {
          await result.current.mutateAsync({} as CreateBaseCvPayload);
        });
      },
    ],
    [
      "update",
      async (wrapper) => {
        const { result } = renderHook(() => useUpdateBaseCv("7"), { wrapper });
        await act(async () => {
          await result.current.mutateAsync({});
        });
      },
    ],
    [
      "delete",
      async (wrapper) => {
        const { result } = renderHook(() => useDeleteBaseCv(), { wrapper });
        await act(async () => {
          await result.current.mutateAsync("7");
        });
      },
    ],
  ];

  it.each(cases)(
    "%s invalidates base-cvs, jobs and job",
    async (_name, run) => {
      const { wrapper, invalidatedKeys } = setup();
      await run(wrapper);
      expect(invalidatedKeys()).toEqual(
        expect.arrayContaining([["base-cvs"], ["jobs"], ["job"]]),
      );
    },
  );
});

describe("useDismissJob (AC10)", () => {
  it("drops the job from a list without dismissed jobs at once, then refetches", async () => {
    const { client, wrapper, invalidatedKeys } = setup();
    const job = makeJob();
    const listKey = ["jobs", DEFAULT_JOB_FILTERS, 1];
    const withDismissedKey = [
      "jobs",
      { ...DEFAULT_JOB_FILTERS, include_dismissed: true },
      1,
    ];
    client.setQueryData(listKey, makePage([job]));
    client.setQueryData(withDismissedKey, makePage([job]));

    let finish: () => void = () => {};
    dismiss.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { result } = renderHook(() => useDismissJob(), { wrapper });
    act(() => result.current.mutate("101"));

    await waitFor(() =>
      expect(client.getQueryData(listKey)).toMatchObject({
        items: [],
        total: 0,
      }),
    );
    expect(client.getQueryData(withDismissedKey)).toMatchObject({
      items: [{ id: "101", dismissed: true }],
    });

    await act(async () => finish());
    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(
        expect.arrayContaining([["jobs"], ["job", "101"]]),
      ),
    );
  });

  it("puts the job back and toasts the API's words when the dismissal fails", async () => {
    const { client, wrapper } = setup();
    const listKey = ["jobs", DEFAULT_JOB_FILTERS, 1];
    client.setQueryData(listKey, makePage([makeJob()]));
    dismiss.mockRejectedValue(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 404, data: { detail: "Job not found" } },
      }),
    );
    const { result } = renderHook(() => useDismissJob(), { wrapper });
    act(() => result.current.mutate("101"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Job not found"),
    );
    expect(client.getQueryData(listKey)).toMatchObject({
      items: [{ id: "101" }],
      total: 1,
    });
  });
});

describe("useStartApplicationFromJob (AC11)", () => {
  it("invalidates jobs, job and drafts so Draft shows on the job", async () => {
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useStartApplicationFromJob(), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ job_id: "101" });
    });
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([["jobs"], ["job"], ["application-drafts"]]),
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});

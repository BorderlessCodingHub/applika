import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { TIMELINE_QUERY_KEY, useTimeline } from "./use-timeline";
import { useCreateTimelineEvent } from "./use-create-timeline-event";
import { useUpdateTimelineEvent } from "./use-update-timeline-event";
import { useDeleteTimelineEvent } from "./use-delete-timeline-event";
import { services } from "@/services/services";
import type { TimelineEvent } from "@/services/types/timeline";

/**
 * PRD 0008 / ADR 0012 (frontend): the timeline query + mutation hooks.
 *
 * - `useTimeline` calls `services.timeline.list(appId)` and caches under
 *   `["timeline","list",appId]`; it stays disabled until an id is present.
 * - `useCreateTimelineEvent` / `useUpdateTimelineEvent` / `useDeleteTimelineEvent`
 *   call the service and, on success, invalidate that application's list key so
 *   the panel re-reads. A 404/409 propagates as the mutation error for a toast.
 */

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

const APP_ID = "800000000000000001";

const EVENT: TimelineEvent = {
  id: "700000000000000001",
  application_id: APP_ID,
  user_id: "900000000000000001",
  event_type: "interview",
  interview_type: "technical",
  denied_reason: null,
  event_date: "2026-07-02",
  start_time: "09:00",
  end_time: "10:00",
  timezone: "Europe/London",
  observation: "Phone screen",
  salary_period: null,
  salary_amount: null,
  salary_currency: null,
  created_at: "2026-07-02T12:00:00Z",
  updated_at: null,
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  vi.mocked(services.timeline.list).mockReset();
  vi.mocked(services.timeline.create).mockReset();
  vi.mocked(services.timeline.update).mockReset();
  vi.mocked(services.timeline.remove).mockReset();
});

describe("TIMELINE_QUERY_KEY", () => {
  it("scopes the list key by application id", () => {
    expect(TIMELINE_QUERY_KEY.list(APP_ID)).toEqual([
      "timeline",
      "list",
      APP_ID,
    ]);
  });
});

describe("useTimeline", () => {
  it("lists events and caches under the application-scoped list key", async () => {
    vi.mocked(services.timeline.list).mockResolvedValue([EVENT]);
    const client = makeClient();

    const { result } = renderHook(() => useTimeline(APP_ID), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(services.timeline.list).toHaveBeenCalledWith(APP_ID);
    expect(result.current.data).toEqual([EVENT]);
    expect(client.getQueryData(TIMELINE_QUERY_KEY.list(APP_ID))).toEqual([
      EVENT,
    ]);
  });

  it("stays disabled (does not fetch) without an application id", () => {
    const client = makeClient();
    const { result } = renderHook(() => useTimeline(null), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(services.timeline.list).not.toHaveBeenCalled();
  });
});

describe("useCreateTimelineEvent", () => {
  it("creates and invalidates the application's list key", async () => {
    vi.mocked(services.timeline.create).mockResolvedValue(EVENT);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    const created = await result.current.mutateAsync({
      applicationId: APP_ID,
      payload: {
        event_type: "interview",
        interview_type: "technical",
        event_date: "2026-07-02",
      },
    });

    expect(created).toEqual(EVENT);
    expect(services.timeline.create).toHaveBeenCalledWith(APP_ID, {
      event_type: "interview",
      interview_type: "technical",
      event_date: "2026-07-02",
    });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: TIMELINE_QUERY_KEY.list(APP_ID),
      }),
    );
  });

  it("surfaces a 409 (archived/closed) as the mutation error", async () => {
    const conflict = Object.assign(new Error("conflict"), {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          detail: "Reopen the application to edit it (it is currently closed)",
        },
      },
    });
    vi.mocked(services.timeline.create).mockRejectedValue(conflict);
    const client = makeClient();

    const { result } = renderHook(() => useCreateTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      applicationId: APP_ID,
      payload: {
        event_type: "interview",
        interview_type: "unknown",
        event_date: "2026-07-02",
      },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(conflict);
  });

  it("surfaces the second-initial-screening 409 as the mutation error", async () => {
    const conflict = Object.assign(new Error("conflict"), {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          detail:
            "This application already has an initial screening interview; an application can have only one",
        },
      },
    });
    vi.mocked(services.timeline.create).mockRejectedValue(conflict);
    const client = makeClient();

    const { result } = renderHook(() => useCreateTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      applicationId: APP_ID,
      payload: {
        event_type: "interview",
        interview_type: "initial_screening",
        event_date: "2026-07-02",
      },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(conflict);
  });
});

describe("useUpdateTimelineEvent", () => {
  it("updates (full PUT) and invalidates the application's list key", async () => {
    const updated = { ...EVENT, observation: "Rescheduled" };
    vi.mocked(services.timeline.update).mockResolvedValue(updated);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      applicationId: APP_ID,
      eventId: EVENT.id,
      payload: {
        event_type: "interview",
        interview_type: "technical",
        event_date: "2026-07-02",
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(services.timeline.update).toHaveBeenCalledWith(APP_ID, EVENT.id, {
      event_type: "interview",
      interview_type: "technical",
      event_date: "2026-07-02",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: TIMELINE_QUERY_KEY.list(APP_ID),
    });
  });
});

describe("useDeleteTimelineEvent", () => {
  it("removes and invalidates the application's list key", async () => {
    vi.mocked(services.timeline.remove).mockResolvedValue(undefined);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ applicationId: APP_ID, eventId: EVENT.id });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(services.timeline.remove).toHaveBeenCalledWith(APP_ID, EVENT.id);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: TIMELINE_QUERY_KEY.list(APP_ID),
    });
  });

  it("surfaces a 404 (not owned) as the mutation error", async () => {
    const notFound = Object.assign(new Error("nf"), {
      isAxiosError: true,
      response: { status: 404, data: { detail: "Timeline event not found" } },
    });
    vi.mocked(services.timeline.remove).mockRejectedValue(notFound);
    const client = makeClient();

    const { result } = renderHook(() => useDeleteTimelineEvent(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ applicationId: APP_ID, eventId: EVENT.id });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(notFound);
  });
});

import { AxiosError, AxiosHeaders } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  SESSIONS_QUERY_KEY,
  mcpCreateErrorMessage,
  useCreateMcpToken,
} from "@/hooks/use-sessions";
import { setTranslatorLocale } from "@/i18n/translator";
import { loadMessages } from "@/i18n/load-messages";
import type { McpTokenCreated } from "@/services/types/sessions";

/**
 * PRD 0023: "Create token" in Profile › MCP. The token comes back once, in
 * the 201: it stays in the mutation's state while shown, `reset()` drops it,
 * nothing logs it, and the sessions list refreshes so the new connection
 * shows in the MCP tab and in Devices.
 */

const createMcpToken = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      createMcpToken: (...args: unknown[]) => createMcpToken(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CREATED: McpTokenCreated = {
  id: "7300000000000000009",
  name: "Claude Code",
  scope: ["read", "write"],
  token: "applika_mcp_fake_00000000000000000000000000000000000000",
  created_at: "2026-11-14T09:00:00Z",
  expires_at: "2027-02-12T09:00:00Z",
};

function refusal(status: number, data: unknown, retryAfter?: string) {
  const headers = new AxiosHeaders();
  if (retryAfter) headers.set("retry-after", retryAfter);
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "refused",
    headers,
    config: {} as never,
    data,
  });
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCreateMcpToken(), { wrapper });
  return { ...hook, client, invalidate };
}

const logged = [
  vi.spyOn(console, "log"),
  vi.spyOn(console, "info"),
  vi.spyOn(console, "debug"),
];

beforeEach(() => {
  createMcpToken.mockReset();
  for (const spy of logged) spy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCreateMcpToken", () => {
  it("sends the name and scope, hands the 201 back and refreshes the sessions list", async () => {
    createMcpToken.mockResolvedValue(CREATED);
    const { result, invalidate } = setup();

    act(() => {
      result.current.mutate({ name: "Claude Code", scope: ["read", "write"] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createMcpToken).toHaveBeenCalledWith({
      name: "Claude Code",
      scope: ["read", "write"],
    });
    expect(result.current.data).toEqual(CREATED);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: SESSIONS_QUERY_KEY });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the token in no query cache, logs nothing, and forgets it on reset", async () => {
    createMcpToken.mockResolvedValue(CREATED);
    const { result, client } = setup();

    act(() => {
      result.current.mutate({ name: "", scope: ["read"] });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    );
    expect(cached).not.toContain(CREATED.token);
    for (const spy of logged) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(CREATED.token);
    }

    act(() => {
      result.current.reset();
    });
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(result.current.isIdle).toBe(true);
  });

  it("a refusal stays in the mutation (said in the dialog): no toast, no refresh", async () => {
    createMcpToken.mockRejectedValue(
      refusal(422, { detail: "Invalid", code: "GEN-1003" }),
    );
    const { result, invalidate } = setup();

    act(() => {
      result.current.mutate({ name: "x", scope: ["read"] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("mcpCreateErrorMessage", () => {
  it("words a 429 with its wait (GEN-1004 and params.seconds)", () => {
    expect(
      mcpCreateErrorMessage(
        refusal(
          429,
          { detail: "x", code: "GEN-1004", params: { seconds: 30 } },
          "30",
        ),
      ),
    ).toBe("Too many requests. Try again in 30 seconds.");
  });

  it("words a code by its message (ADR-0025)", () => {
    expect(
      mcpCreateErrorMessage(refusal(422, { detail: "x", code: "GEN-1003" })),
    ).toBe("Some fields are not valid. Check them and try again.");
    expect(
      mcpCreateErrorMessage(refusal(503, { detail: "x", code: "AUTH-1003" })),
    ).toBe("Session service unavailable");
  });

  it("shows a server detail without a known code verbatim", () => {
    expect(
      mcpCreateErrorMessage(
        refusal(400, { detail: "The name is at most 100 characters" }),
      ),
    ).toBe("The name is at most 100 characters");
  });

  it("falls back to its own words without an answer", () => {
    expect(mcpCreateErrorMessage(new Error("offline"))).toBe(
      "Could not create the token. Try again.",
    );
    expect(mcpCreateErrorMessage(refusal(500, null))).toBe(
      "Could not create the token. Try again.",
    );
  });

  it("speaks Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));

    expect(mcpCreateErrorMessage(new Error("offline"))).toBe(
      "Não foi possível criar o token. Tente novamente.",
    );
    expect(
      mcpCreateErrorMessage(refusal(422, { detail: "x", code: "GEN-1003" })),
    ).not.toBe("Some fields are not valid. Check them and try again.");
  });
});

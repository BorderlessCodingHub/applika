import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api-client";
import { isTemporary } from "@/lib/rate-limit";
import { services } from "@/services/services";

/**
 * KODI-058: the 401 interceptor's refresh. A refresh refused with 503 (the
 * session store is down) must surface as that temporary 503 — never as a
 * sign-out — and the device approval routes, which live under `/auth/`,
 * refresh on a 401 like any other signed-in call.
 */

vi.mock("@/services/services", () => ({
  services: { auth: { refresh: vi.fn() } },
}));

function response(status: number, url: string, detail = "x") {
  return new AxiosError(
    "failed",
    status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: String(status),
      headers: new AxiosHeaders(
        status === 503 ? { "retry-after": "5" } : undefined,
      ),
      config: { url } as never,
      data: { detail },
    },
  );
}

const calls: string[] = [];
let answers: Array<number | [number, string]> = [];
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  calls.length = 0;
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config.url ?? "");
    const answer = answers.shift() ?? 200;
    const [status, detail] =
      typeof answer === "number" ? [answer, "x"] : answer;
    if (status === 200) {
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    const error = response(status, config.url ?? "", detail);
    error.config = config;
    throw error;
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.mocked(services.auth.refresh).mockReset();
});

describe("api-client 401 interceptor", () => {
  it("a 401 whose refresh answers 503 rejects with the 503, a temporary error", async () => {
    answers = [401];
    vi.mocked(services.auth.refresh).mockRejectedValueOnce(
      response(503, "/auth/refresh", "Session service unavailable"),
    );

    const error = await api.get("/users/me/sessions").catch((e) => e);

    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(isTemporary(error)).toBe(true);
    expect((error as AxiosError).response?.status).toBe(503);
    expect(calls).toEqual(["/users/me/sessions"]);
  });

  it("a 401 whose refresh succeeds replays the request", async () => {
    answers = [401, 200];
    vi.mocked(services.auth.refresh).mockResolvedValueOnce({ detail: "ok" });

    const result = await api.get("/users/me");

    expect(result.data).toEqual({ ok: true });
    expect(calls).toEqual(["/users/me", "/users/me"]);
  });

  it("refreshes on a 401 from the device approval routes", async () => {
    answers = [401, 200];
    vi.mocked(services.auth.refresh).mockResolvedValueOnce({ detail: "ok" });

    await api.get("/auth/device/verify", { params: { user_code: "BCDF" } });

    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["/auth/device/verify", "/auth/device/verify"]);
  });

  it("never refreshes on a 401 from another /auth/ route", async () => {
    answers = [401];

    const error = await api.get("/auth/refresh").catch((e) => e);

    expect(services.auth.refresh).not.toHaveBeenCalled();
    expect((error as AxiosError).response?.status).toBe(401);
  });

  it("refreshes on a 401 from the GitHub restore start", async () => {
    answers = [401, 200];
    vi.mocked(services.auth.refresh).mockResolvedValueOnce({ detail: "ok" });

    await api.post("/auth/github/restore");

    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["/auth/github/restore", "/auth/github/restore"]);
  });

  it("refreshes the membership confirm only when the session is not authenticated", async () => {
    answers = [[401, "Not authenticated"], 200];
    vi.mocked(services.auth.refresh).mockResolvedValueOnce({ detail: "ok" });

    await api.post("/auth/borderless/confirm", {});

    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "/auth/borderless/confirm",
      "/auth/borderless/confirm",
    ]);
  });

  it("never replays a wrong Borderless password", async () => {
    answers = [[401, "Invalid email or password"]];

    const error = await api
      .post("/auth/borderless/confirm", {})
      .catch((e) => e);

    expect(services.auth.refresh).not.toHaveBeenCalled();
    expect(calls).toEqual(["/auth/borderless/confirm"]);
    expect((error as AxiosError).response?.status).toBe(401);
  });

  it("never refreshes on a 401 from the Borderless sign-in", async () => {
    answers = [[401, "Invalid email or password"]];

    await api.post("/auth/borderless/signin", {}).catch((e) => e);

    expect(services.auth.refresh).not.toHaveBeenCalled();
  });
});

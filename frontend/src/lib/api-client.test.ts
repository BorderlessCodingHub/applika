import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import { setTranslatorLocale } from "@/i18n/translator";
import { api, getApiError } from "@/lib/api-client";
import { getBlobApiError } from "@/lib/blob-error";
import { borderlessErrorWords } from "@/lib/borderless-error";
import { isTemporary, rateLimitNotice } from "@/lib/rate-limit";
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

function response(
  status: number,
  url: string,
  detail: unknown = "x",
  code?: string,
) {
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
      data: code ? { detail, code } : { detail },
    },
  );
}

const calls: string[] = [];
let answers: Array<number | [number, string] | [number, string, string]> = [];
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  calls.length = 0;
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config.url ?? "");
    const answer = answers.shift() ?? 200;
    const [status, detail, code] =
      typeof answer === "number" ? [answer, "x", undefined] : answer;
    if (status === 200) {
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    const error = response(status, config.url ?? "", detail, code);
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

  it("refreshes the membership confirm on AUTH-1001, not authenticated", async () => {
    answers = [[401, "Not authenticated", "AUTH-1001"], 200];
    vi.mocked(services.auth.refresh).mockResolvedValueOnce({ detail: "ok" });

    await api.post("/auth/borderless/confirm", {});

    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "/auth/borderless/confirm",
      "/auth/borderless/confirm",
    ]);
  });

  it("keys the confirm on the code, not the words: AUTH-1004 never replays", async () => {
    answers = [[401, "Not authenticated", "AUTH-1004"]];

    await api.post("/auth/borderless/confirm", {}).catch((e) => e);

    expect(services.auth.refresh).not.toHaveBeenCalled();
    expect(calls).toEqual(["/auth/borderless/confirm"]);
  });

  it("an API older than the codes: the confirm still refreshes on the words", async () => {
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

/** An axios error carrying `data` (any shape), as the API answers. */
function refused(
  status: number,
  data: unknown,
  headers?: Record<string, string>,
) {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(headers),
    config: {} as never,
    data,
  });
}

async function inPortuguese() {
  setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
}

describe("errors by code (ADR-0025)", () => {
  afterEach(() => setTranslatorLocale(DEFAULT_LOCALE, en));

  it("a known code shows its English message under en", () => {
    expect(
      getApiError(
        refused(404, { detail: "Draft not found", code: "APP-1009" }),
      ),
    ).toBe("Draft not found");
  });

  it("a known code shows its pt-BR text, with its params filled in", async () => {
    await inPortuguese();
    expect(
      getApiError(
        refused(404, { detail: "Draft not found", code: "APP-1009" }),
      ),
    ).toBe("Rascunho não encontrado");
    expect(
      getApiError(
        refused(422, {
          detail:
            "At least 5 applications are required to start a new cycle (currently 2)",
          code: "CYC-1001",
          params: { min: 5, current: 2 },
        }),
      ),
    ).toBe(
      "São necessárias pelo menos 5 candidaturas para iniciar um novo ciclo (atualmente 2)",
    );
    expect(
      getApiError(
        refused(409, {
          detail:
            "A public company with this name and URL already exists: Acme (https://acme.example, id 7)",
          code: "ADM-1004",
          params: { name: "Acme", url: "https://acme.example", id: "7" },
        }),
      ),
    ).toBe(
      "Já existe uma empresa pública com este nome e URL: Acme (https://acme.example, id 7)",
    );
  });

  it("an unknown code shows the API's English detail", async () => {
    await inPortuguese();
    expect(
      getApiError(
        refused(409, { detail: "Something brand new", code: "NEW-1001" }),
      ),
    ).toBe("Something brand new");
  });

  it("a params code whose params are missing falls back to the detail, never a half sentence", async () => {
    await inPortuguese();
    expect(
      getApiError(
        refused(429, {
          detail: "Too many requests. Try again in 30 seconds.",
          code: "GEN-1004",
        }),
      ),
    ).toBe("Too many requests. Try again in 30 seconds.");
  });

  it("no body, or no words: the generic line in the active language", async () => {
    expect(getApiError(new AxiosError("network"))).toBe("Something went wrong");
    expect(getApiError(refused(500, {}))).toBe("Something went wrong");
    await inPortuguese();
    expect(getApiError(new AxiosError("network"))).toBe("Algo deu errado");
    expect(getApiError(refused(502, "<html>bad gateway</html>"))).toBe(
      "Algo deu errado",
    );
  });

  it("a validation 422 (GEN-1003) is one translated line, never the field list", async () => {
    const validation = refused(422, {
      detail: [{ loc: ["body", "name"], msg: "Field required" }],
      code: "GEN-1003",
    });
    expect(getApiError(validation)).toBe(
      "Some fields are not valid. Check them and try again.",
    );
    await inPortuguese();
    expect(getApiError(validation)).toBe(
      "Alguns campos não são válidos. Verifique-os e tente novamente.",
    );
  });

  it("a 422 list without a code (an old API) never reaches the screen", () => {
    expect(
      getApiError(refused(422, { detail: [{ msg: "Field required" }] })),
    ).toBe("Something went wrong");
  });

  it("the blob helper reads the bytes, then follows the same chain", async () => {
    const blob = new Blob(
      [
        JSON.stringify({
          detail: "Could not render the CV PDF",
          code: "CV-1008",
        }),
      ],
      { type: "application/json" },
    );
    await inPortuguese();
    expect(await getBlobApiError(refused(500, blob))).toBe(
      "Não foi possível gerar o PDF do CV",
    );
    expect(await getBlobApiError(refused(500, new Blob(["<html>"])))).toBe(
      "Algo deu errado",
    );
  });

  it("a 429 notice: GEN-1004 with params.seconds, else Retry-After, in the active language", async () => {
    await inPortuguese();
    expect(
      rateLimitNotice(
        refused(429, {
          detail: "Too many requests. Try again in 30 seconds.",
          code: "GEN-1004",
          params: { seconds: 30 },
        }),
      ),
    ).toBe("Muitas solicitações. Tente novamente em 30 segundos.");
    expect(rateLimitNotice(refused(429, {}, { "retry-after": "12" }))).toBe(
      "Muitas solicitações. Tente novamente em 12 segundos.",
    );
    expect(rateLimitNotice(refused(429, {}))).toBeNull();
  });

  it("the sign-in words go by code; CLI login expired keys on AUTH-1019", async () => {
    const expired = borderlessErrorWords(
      refused(400, { detail: "CLI login expired", code: "AUTH-1019" }),
    );
    expect(expired).toEqual({
      message: "CLI login expired",
      cliLoginExpired: true,
      status: 400,
      code: "AUTH-1019",
    });
    // The words alone no longer decide.
    expect(
      borderlessErrorWords(refused(400, { detail: "CLI login expired" }))
        .cliLoginExpired,
    ).toBe(false);

    await inPortuguese();
    expect(
      borderlessErrorWords(
        refused(429, {
          detail: "Too many sign-in attempts. Try again in 42 seconds.",
          code: "AUTH-1009",
          params: { seconds: 42 },
        }),
      ).message,
    ).toBe("Muitas tentativas de entrar. Tente novamente em 42 segundos.");
    expect(
      borderlessErrorWords(
        refused(403, {
          detail: "Reports are for Borderless BASE and PSP members",
          code: "RPT-1001",
        }),
      ).message,
    ).toBe("Os relatórios são para membros BASE e PSP da Borderless");
    expect(borderlessErrorWords(new AxiosError("offline")).message).toBe(
      "Não foi possível acessar o Applika. Verifique sua conexão e tente novamente.",
    );
    expect(borderlessErrorWords(new Error("boom")).message).toBe(
      "O login não foi concluído. Tente novamente.",
    );
  });
});

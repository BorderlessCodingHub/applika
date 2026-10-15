import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import {
  isRateLimited,
  isServiceUnavailable,
  isTemporary,
  rateLimitNotice,
  retryAfterMs,
} from "@/lib/rate-limit";

function rateLimitError(opts?: {
  retryAfter?: string;
  detail?: unknown;
  status?: number;
}) {
  const status = opts?.status ?? 429;
  const headers = new AxiosHeaders();
  if (opts?.retryAfter !== undefined) {
    headers.set("retry-after", opts.retryAfter);
  }
  const detail =
    opts && "detail" in opts
      ? opts.detail
      : "Too many requests. Try again in 30 seconds.";
  return new AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: "Too Many Requests",
      headers,
      config: {} as never,
      data: { detail },
    },
  );
}

describe("isRateLimited", () => {
  it("is true for an axios 429", () => {
    expect(isRateLimited(rateLimitError())).toBe(true);
  });

  it("is false for a non-429 axios error", () => {
    expect(isRateLimited(rateLimitError({ status: 500 }))).toBe(false);
  });

  it("is false for a plain error", () => {
    expect(isRateLimited(new Error("boom"))).toBe(false);
  });

  it("is false for undefined/null", () => {
    expect(isRateLimited(undefined)).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("reads Retry-After in seconds and converts to ms", () => {
    expect(retryAfterMs(rateLimitError({ retryAfter: "30" }))).toBe(30_000);
  });

  it("clamps to at least one second", () => {
    expect(retryAfterMs(rateLimitError({ retryAfter: "0" }))).toBe(1_000);
  });

  it("falls back to 60s when the header is missing", () => {
    expect(retryAfterMs(rateLimitError({}))).toBe(60_000);
  });

  it("falls back to 60s when the header is not a number", () => {
    expect(retryAfterMs(rateLimitError({ retryAfter: "not-a-number" }))).toBe(
      60_000,
    );
  });

  it("falls back to 60s for a non-rate-limited error", () => {
    expect(retryAfterMs(new Error("boom"))).toBe(60_000);
  });
});

describe("rateLimitNotice", () => {
  it("returns the server's detail on a 429", () => {
    expect(
      rateLimitNotice(
        rateLimitError({
          detail: "Too many requests. Try again in 30 seconds.",
        }),
      ),
    ).toBe("Too many requests. Try again in 30 seconds.");
  });

  it("returns null when detail is not a non-empty string", () => {
    expect(rateLimitNotice(rateLimitError({ detail: undefined }))).toBeNull();
    expect(rateLimitNotice(rateLimitError({ detail: "" }))).toBeNull();
    expect(
      rateLimitNotice(rateLimitError({ detail: ["array", "detail"] })),
    ).toBeNull();
  });

  it("returns null for a non-429 error", () => {
    expect(rateLimitNotice(rateLimitError({ status: 500 }))).toBeNull();
    expect(rateLimitNotice(new Error("boom"))).toBeNull();
  });
});

/**
 * KODI-058 (ADR-0019 "fail closed"): a 503 "Session service unavailable"
 * means Redis is down, not that the session ended. It is temporary like a
 * 429, so the web waits `Retry-After` and retries, never signs out.
 */
describe("isTemporary / isServiceUnavailable (KODI-058)", () => {
  it("is true for a 429 and for a 503", () => {
    expect(isTemporary(rateLimitError())).toBe(true);
    expect(isTemporary(rateLimitError({ status: 503 }))).toBe(true);
    expect(isServiceUnavailable(rateLimitError({ status: 503 }))).toBe(true);
    expect(isServiceUnavailable(rateLimitError())).toBe(false);
  });

  it("is false for a 401, a 500, a plain error and nothing", () => {
    expect(isTemporary(rateLimitError({ status: 401 }))).toBe(false);
    expect(isTemporary(rateLimitError({ status: 500 }))).toBe(false);
    expect(isTemporary(new Error("boom"))).toBe(false);
    expect(isTemporary(undefined)).toBe(false);
  });

  it("a 503 is not rate limited, so its detail is no rate-limit notice", () => {
    const unavailable = rateLimitError({
      status: 503,
      detail: "Session service unavailable",
    });
    expect(isRateLimited(unavailable)).toBe(false);
    expect(rateLimitNotice(unavailable)).toBeNull();
  });
});

describe("retryAfterMs on a 503 (KODI-058)", () => {
  it("reads the 503's Retry-After: 5 as 5000ms", () => {
    expect(retryAfterMs(rateLimitError({ status: 503, retryAfter: "5" }))).toBe(
      5_000,
    );
  });

  it("clamps a 503's Retry-After to at least one second", () => {
    expect(retryAfterMs(rateLimitError({ status: 503, retryAfter: "0" }))).toBe(
      1_000,
    );
  });

  it("falls back to 5s, not 60s, when a 503 has no usable header", () => {
    expect(retryAfterMs(rateLimitError({ status: 503 }))).toBe(5_000);
    expect(
      retryAfterMs(rateLimitError({ status: 503, retryAfter: "soon" })),
    ).toBe(5_000);
  });
});

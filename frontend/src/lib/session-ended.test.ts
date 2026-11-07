import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  grantEndedCode,
  recordRefusedRefresh,
  refusedRefresh,
  resetRefusedRefresh,
  signInPathFor,
  subscribeRefusedRefresh,
} from "./session-ended";

/**
 * AUTH-1049 (ADR-0026): the refused refresh that ends a web session because
 * Borderless refused applika's grant. Only that code carries words to the
 * sign-in page; every other refusal lands on a plain `/login`.
 */

function refused(status: number, data: unknown) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data,
  });
}

const GRANT_ENDED = refused(401, {
  detail: "Your Borderless sign-in has ended. Sign in again with Borderless",
  code: "AUTH-1049",
});

afterEach(() => {
  resetRefusedRefresh();
  // Real timers back even when a test fails half-way (it set fake ones).
  vi.useRealTimers();
});

describe("grantEndedCode", () => {
  it("is AUTH-1049 for its 401 only", () => {
    expect(grantEndedCode(GRANT_ENDED)).toBe("AUTH-1049");
    expect(grantEndedCode(refused(403, { code: "AUTH-1049" }))).toBeNull();
    expect(grantEndedCode(refused(401, { code: "AUTH-1015" }))).toBeNull();
    expect(
      grantEndedCode(refused(401, { detail: "Not authenticated" })),
    ).toBeNull();
    expect(grantEndedCode(new AxiosError("offline"))).toBeNull();
    expect(grantEndedCode(new Error("boom"))).toBeNull();
    expect(grantEndedCode(null)).toBeNull();
  });
});

describe("signInPathFor", () => {
  it("carries a code as ?error=, else is a plain /login", () => {
    expect(signInPathFor("AUTH-1049")).toBe("/login?error=AUTH-1049");
    expect(signInPathFor(null)).toBe("/login");
    expect(signInPathFor(undefined)).toBe("/login");
    expect(signInPathFor("")).toBe("/login");
  });
});

describe("the recorded refusal", () => {
  it("records AUTH-1049 with its time and tells the subscribers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const listener = vi.fn();
    const unsubscribe = subscribeRefusedRefresh(listener);

    recordRefusedRefresh(GRANT_ENDED);
    const first = refusedRefresh();
    expect(first).toEqual({
      code: "AUTH-1049",
      at: Date.parse("2026-11-06T12:00:00Z"),
    });
    // The same object until the next record (a stable snapshot).
    expect(refusedRefresh()).toBe(first);

    vi.setSystemTime(new Date("2026-11-06T12:05:00Z"));
    recordRefusedRefresh(GRANT_ENDED);
    expect(refusedRefresh()?.at).toBe(Date.parse("2026-11-06T12:05:00Z"));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("ignores every other refusal", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRefusedRefresh(listener);

    recordRefusedRefresh(refused(401, { code: "AUTH-1015" }));
    recordRefusedRefresh(refused(503, { code: "AUTH-1003" }));

    expect(refusedRefresh()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops telling a subscriber that left", () => {
    const listener = vi.fn();
    subscribeRefusedRefresh(listener)();

    recordRefusedRefresh(GRANT_ENDED);

    expect(listener).not.toHaveBeenCalled();
  });
});

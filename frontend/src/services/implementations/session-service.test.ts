import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const del = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    delete: (...args: unknown[]) => del(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { AuthService } from "./auth-service";
import { SessionService } from "./session-service";

/** KODI-058: the exact routes and bodies of the device calls (the API contract). */

beforeEach(() => {
  for (const fn of [get, del, post]) {
    fn.mockReset();
    fn.mockResolvedValue({ data: { revoked: 2 } });
  }
});

describe("SessionService", () => {
  it("lists GET /users/me/sessions", async () => {
    get.mockResolvedValueOnce({ data: [] });
    await expect(new SessionService().list()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith("/users/me/sessions");
  });

  it("revokes DELETE /users/me/sessions/{id}", async () => {
    await expect(
      new SessionService().revoke("7300000000000000001"),
    ).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith("/users/me/sessions/7300000000000000001");
  });

  it("signs out the others with POST /users/me/sessions/revoke-others", async () => {
    await expect(new SessionService().revokeOthers()).resolves.toEqual({
      revoked: 2,
    });
    expect(post).toHaveBeenCalledWith("/users/me/sessions/revoke-others");
  });
});

describe("AuthService device code calls", () => {
  it("verifies with GET /auth/device/verify?user_code=", async () => {
    await new AuthService().verifyDeviceCode("BCDF-GHJK");
    expect(get).toHaveBeenCalledWith("/auth/device/verify", {
      params: { user_code: "BCDF-GHJK" },
    });
  });

  it("approves and denies with POST {user_code}", async () => {
    await new AuthService().approveDeviceCode("BCDF-GHJK");
    await new AuthService().denyDeviceCode("BCDF-GHJK");
    expect(post).toHaveBeenNthCalledWith(1, "/auth/device/approve", {
      user_code: "BCDF-GHJK",
    });
    expect(post).toHaveBeenNthCalledWith(2, "/auth/device/deny", {
      user_code: "BCDF-GHJK",
    });
  });
});

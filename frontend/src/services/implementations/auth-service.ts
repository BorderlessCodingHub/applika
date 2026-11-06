import { IAuthService } from "../interfaces/i-auth-service";
import {
  BorderlessCredentials,
  BorderlessSignInResult,
  DeviceCodeInfo,
  GithubRestoreStart,
} from "../types/auth";
import { api } from "@/lib/api-client";

export class AuthService implements IAuthService {
  refresh(): Promise<{ detail: string }> {
    return api.get("/auth/refresh");
  }
  logout(): Promise<{ detail: string }> {
    return api.get("/auth/logout");
  }
  /**
   * 200 sets the session cookies on the web; with a pending CLI login it
   * answers `redirect_to` and sets none. Refusals: 400 AUTH-1019 "CLI login
   * expired", 401 AUTH-1004, 403 AUTH-1005, 409 AUTH-1006 / AUTH-1007, 422
   * AUTH-1008, 429 AUTH-1009, 503 AUTH-1017 (`docs/error-codes.md`).
   */
  borderlessSignIn(
    credentials: BorderlessCredentials,
  ): Promise<BorderlessSignInResult> {
    return api
      .post<BorderlessSignInResult>("/auth/borderless/signin", credentials)
      .then((r) => r.data);
  }
  /** 204: the Borderless access is renewed, the applika session untouched. */
  confirmMembership(credentials: BorderlessCredentials): Promise<void> {
    return api
      .post("/auth/borderless/confirm", credentials)
      .then(() => undefined);
  }
  /** 200 the GitHub consent URL | 409 already has its GitHub data | 503. */
  startGithubRestore(): Promise<GithubRestoreStart> {
    return api
      .post<GithubRestoreStart>("/auth/github/restore")
      .then((r) => r.data);
  }
  /** 204, idempotent: the `/welcome` choice is answered. */
  dismissGithubRestore(): Promise<void> {
    return api.post("/users/me/github-restore/dismiss").then(() => undefined);
  }
  /** 404 "Code not found or expired"; the server normalizes dashes and case. */
  verifyDeviceCode(userCode: string): Promise<DeviceCodeInfo> {
    return api
      .get<DeviceCodeInfo>("/auth/device/verify", {
        params: { user_code: userCode },
      })
      .then((r) => r.data);
  }
  /** 204 | 404 | 409 "Code already used". */
  approveDeviceCode(userCode: string): Promise<void> {
    return api
      .post("/auth/device/approve", { user_code: userCode })
      .then(() => undefined);
  }
  /** 204 | 404 | 409 "Code already used". */
  denyDeviceCode(userCode: string): Promise<void> {
    return api
      .post("/auth/device/deny", { user_code: userCode })
      .then(() => undefined);
  }
}

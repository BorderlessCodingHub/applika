import { IAuthService } from "../interfaces/i-auth-service";
import { DeviceCodeInfo, GithubRestoreStart } from "../types/auth";
import { APP_CONFIG } from "@/config";
import { api } from "@/lib/api-client";

export class AuthService implements IAuthService {
  refresh(): Promise<{ detail: string }> {
    return api.get("/auth/refresh");
  }
  logout(): Promise<{ detail: string }> {
    return api.get("/auth/logout");
  }
  /**
   * Where "Sign in with Borderless" sends the browser, a top-level
   * navigation (ADR-0026): the API 307s to Borderless's own sign-in page and
   * its callback comes back to `/login`, signed in or with `?error=<code>`.
   * The web never sees a code, a state or a token.
   */
  borderlessLoginUrl(): string {
    return `${APP_CONFIG.envs.apiBaseURL}/auth/borderless/login`;
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

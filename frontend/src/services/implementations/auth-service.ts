import { IAuthService } from "../interfaces/i-auth-service";
import {
  AccountLinkOut,
  AccountLinkStart,
  DeviceCodeInfo,
} from "../types/auth";
import { api } from "@/lib/api-client";

export class AuthService implements IAuthService {
  refresh(): Promise<{ detail: string }> {
    return api.get("/auth/refresh");
  }
  logout(): Promise<{ detail: string }> {
    return api.get("/auth/logout");
  }
  startDiscordLink(): Promise<AccountLinkStart> {
    return api.post<AccountLinkStart>("/auth/link/discord").then((r) => r.data);
  }
  unlinkDiscord(): Promise<AccountLinkOut> {
    return api.delete<AccountLinkOut>("/auth/link/discord").then((r) => r.data);
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

import { IAuthService } from "../interfaces/i-auth-service";
import { AccountLinkOut, AccountLinkStart } from "../types/auth";
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
}

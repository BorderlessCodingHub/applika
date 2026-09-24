import { AccountLinkOut, AccountLinkStart } from "../types/auth";

export interface IAuthService {
  refresh(): Promise<{ detail: string }>;
  logout(): Promise<{ detail: string }>;
  startDiscordLink(): Promise<AccountLinkStart>;
  unlinkDiscord(): Promise<AccountLinkOut>;
}

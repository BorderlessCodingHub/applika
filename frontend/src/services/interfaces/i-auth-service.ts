import {
  AccountLinkOut,
  AccountLinkStart,
  DeviceCodeInfo,
} from "../types/auth";

export interface IAuthService {
  refresh(): Promise<{ detail: string }>;
  logout(): Promise<{ detail: string }>;
  startDiscordLink(): Promise<AccountLinkStart>;
  unlinkDiscord(): Promise<AccountLinkOut>;
  verifyDeviceCode(userCode: string): Promise<DeviceCodeInfo>;
  approveDeviceCode(userCode: string): Promise<void>;
  denyDeviceCode(userCode: string): Promise<void>;
}

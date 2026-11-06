import {
  BorderlessCredentials,
  BorderlessSignInResult,
  DeviceCodeInfo,
  GithubRestoreStart,
} from "../types/auth";

export interface IAuthService {
  refresh(): Promise<{ detail: string }>;
  logout(): Promise<{ detail: string }>;
  borderlessSignIn(
    credentials: BorderlessCredentials,
  ): Promise<BorderlessSignInResult>;
  confirmMembership(credentials: BorderlessCredentials): Promise<void>;
  startGithubRestore(): Promise<GithubRestoreStart>;
  dismissGithubRestore(): Promise<void>;
  verifyDeviceCode(userCode: string): Promise<DeviceCodeInfo>;
  approveDeviceCode(userCode: string): Promise<void>;
  denyDeviceCode(userCode: string): Promise<void>;
}

import { GithubRestoreStart } from "../types/auth";

export interface IAuthService {
  refresh(): Promise<{ detail: string }>;
  logout(): Promise<{ detail: string }>;
  borderlessLoginUrl(): string;
  startGithubRestore(): Promise<GithubRestoreStart>;
  dismissGithubRestore(): Promise<void>;
}

import type { RevokeOthersResult, UserSession } from "../types/sessions";

export interface ISessionService {
  list(): Promise<UserSession[]>;
  revoke(id: string): Promise<void>;
  revokeOthers(): Promise<RevokeOthersResult>;
}

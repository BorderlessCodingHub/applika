import type {
  McpTokenCreate,
  McpTokenCreated,
  RevokeOthersResult,
  UserSession,
} from "../types/sessions";

export interface ISessionService {
  list(): Promise<UserSession[]>;
  revoke(id: string): Promise<void>;
  revokeOthers(): Promise<RevokeOthersResult>;
  createMcpToken(body: McpTokenCreate): Promise<McpTokenCreated>;
}

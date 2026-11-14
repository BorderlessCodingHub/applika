import { api } from "@/lib/api-client";
import type { ISessionService } from "@/services/interfaces/i-session-service";
import type {
  McpTokenCreate,
  McpTokenCreated,
  RevokeOthersResult,
  UserSession,
} from "@/services/types/sessions";

/** The caller's devices (ADR-0019): `/users/me/sessions`. */
export class SessionService implements ISessionService {
  /** Server order: active by last use, then ended within 30 days. */
  list(): Promise<UserSession[]> {
    return api.get<UserSession[]>("/users/me/sessions").then((r) => r.data);
  }

  /** 204; an ended row is a no-op 204; the current row also clears both cookies. */
  revoke(id: string): Promise<void> {
    return api
      .delete(`/users/me/sessions/${encodeURIComponent(id)}`)
      .then(() => undefined);
  }

  revokeOthers(): Promise<RevokeOthersResult> {
    return api
      .post<RevokeOthersResult>("/users/me/sessions/revoke-others")
      .then((r) => r.data);
  }

  /**
   * A new MCP connection (ADR-0028): 201 carries the token, the only answer
   * that ever does. It is handed to the caller and kept nowhere else.
   */
  createMcpToken(body: McpTokenCreate): Promise<McpTokenCreated> {
    return api
      .post<McpTokenCreated>("/users/me/mcp-tokens", body)
      .then((r) => r.data);
  }
}

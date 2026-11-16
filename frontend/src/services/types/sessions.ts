/** `/users/me/sessions` wire types (ADR-0019). Ids are Snowflake strings. */

export type SessionStatus = "active" | "signed_out" | "revoked" | "expired";

export type SessionClientType = "web" | "cli" | "mcp";

export type SignInMethod =
  | "borderless"
  | "github_web"
  | "cli_browser"
  | "cli_device"
  | "cli_legacy"
  | "mcp_token";

/** An MCP token's scope names (ADR-0028); every token holds `read`. */
export type McpScopeName = "read" | "write" | "delete";

/** `GET /users/me/sessions` item. */
export interface UserSession {
  id: string;
  client_type: SessionClientType;
  sign_in_method: SignInMethod;
  device_name: string;
  client_label: string;
  created_ip: string | null;
  last_ip: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  ended_at: string | null;
  status: SessionStatus;
  current: boolean;
  /** An `mcp` row's scope (ADR-0028); `null` on web and cli rows. */
  scope: readonly McpScopeName[] | null;
}

/** `POST /users/me/mcp-tokens` body: a blank or absent name becomes "MCP connection". */
export interface McpTokenCreate {
  name?: string;
  scope: McpScopeName[];
}

/** `POST /users/me/mcp-tokens` 201: the only answer that carries `token`. */
export interface McpTokenCreated {
  id: string;
  name: string;
  scope: McpScopeName[];
  token: string;
  created_at: string;
  expires_at: string;
}

/** `POST /users/me/sessions/revoke-others` response. */
export interface RevokeOthersResult {
  revoked: number;
}

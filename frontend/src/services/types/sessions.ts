/** `/users/me/sessions` wire types (KODI-057, ADR-0019). Ids are Snowflake strings. */

export type SessionStatus = "active" | "signed_out" | "revoked" | "expired";

export type SessionClientType = "web" | "cli";

export type SignInMethod =
  | "github_web"
  | "cli_browser"
  | "cli_device"
  | "cli_legacy";

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
}

/** `POST /users/me/sessions/revoke-others` response. */
export interface RevokeOthersResult {
  revoked: number;
}

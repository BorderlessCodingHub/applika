/**
 * Account-link wire types (KODI-022, plan 0009). The profile's "Connected
 * accounts" card only ever handles Discord today; `AccountLinkStart` and
 * `AccountLinkOut` are provider-agnostic shapes because the routes they
 * describe (`POST`/`DELETE /auth/link/discord`) already are.
 */

/** `POST /auth/link/discord` response — where to send the user to consent. */
export interface AccountLinkStart {
  authorize_url: string;
}

/** `DELETE /auth/link/discord` response — the post-unlink link state. */
export interface AccountLinkOut {
  provider: string;
  linked: boolean;
}

/**
 * `GET /auth/device/verify?user_code=` response (KODI-058, ADR-0019): the
 * device asking to sign in, shown on `/device` before the user approves.
 * Structurally the `DeviceRequestInfo` the approval card renders.
 */
export interface DeviceCodeInfo {
  device_name: string;
  client_label: string;
  ip: string | null;
  requested_at: string;
  expires_at: string;
}

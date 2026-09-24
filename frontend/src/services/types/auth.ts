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

/** The Borderless email and password, for `POST /auth/borderless/signin` and `/confirm`. */
export interface BorderlessCredentials {
  email: string;
  password: string;
}

/**
 * `POST /auth/borderless/signin` 200. `redirect_to`: where the browser goes
 * to hand a CLI sign-in back (null on the web, which got its cookies).
 * `new_account`: this sign-in created the applika account.
 */
export interface BorderlessSignInResult {
  redirect_to: string | null;
  new_account: boolean;
}

/**
 * The Borderless sign-in refusals ADR-0024 named, numbered by ADR-0025
 * (`docs/error-codes.md`): AUTH-1005 was `email_unverified`, AUTH-1006
 * `binding_conflict` (sign-in), AUTH-1007 `email_ambiguous`, AUTH-1008
 * `email_unusable`. AUTH-1010 is the membership confirm's 409 (also
 * `binding_conflict` before).
 */
export type BorderlessRefusalCode =
  | "AUTH-1005"
  | "AUTH-1006"
  | "AUTH-1007"
  | "AUTH-1008"
  | "AUTH-1010";

/** The report refusals: RPT-1001 was `badge_required`, RPT-1002 `membership_unconfirmed`. */
export type ReportRefusalCode = "RPT-1001" | "RPT-1002";

/** `POST /auth/github/restore` 200: where to send the browser to approve. */
export interface GithubRestoreStart {
  authorize_url: string;
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

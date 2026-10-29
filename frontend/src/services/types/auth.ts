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

/** Refusal bodies that carry a machine-readable `code` beside the words. */
export type BorderlessRefusalCode =
  | "email_unverified"
  | "email_unusable"
  | "binding_conflict"
  | "email_ambiguous";

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

/**
 * The report refusals: RPT-1001 (was `badge_required`) no recorded BASE or
 * PSP badge; AUTH-1050 a recorded badge while Borderless refuses applika's
 * grant, until the next sign-in on the web (ADR-0026, `docs/error-codes.md`).
 */
export type ReportRefusalCode = "RPT-1001" | "AUTH-1050";

/** AUTH-1050: member features wait for a new sign-in (`docs/error-codes.md`). */
export const MEMBERSHIP_LOCKED_CODE = "AUTH-1050";

/** `POST /auth/github/restore` 200: where to send the browser to approve. */
export interface GithubRestoreStart {
  authorize_url: string;
}

/**
 * `GET /auth/device/verify?user_code=` response (ADR-0019): the
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

/** `GET /auth/device/verify` 200; the service's `DeviceCodeInfo` must match it structurally. */
export interface DeviceRequestInfo {
  device_name: string;
  client_label: string;
  ip: string | null;
  requested_at: string;
  expires_at: string;
}

export type DeviceOutcomeKind = "approved" | "denied";

export const USER_CODE_LENGTH = 8;

/**
 * Where "See your devices" leads. The screens' words are the `device.*`
 * messages (`device.terms.*` for the request card's labels).
 */
export const DEVICES_HREF = "/profile?tab=devices";

/** Uppercase, letters and digits only, a dash after the fourth; the server normalizes too. */
export function normalizeUserCode(raw: string): string {
  const chars = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, USER_CODE_LENGTH);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

export function isCompleteUserCode(code: string): boolean {
  return code.replace(/[^A-Za-z0-9]/g, "").length === USER_CODE_LENGTH;
}

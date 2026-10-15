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

export const DEVICE_SIGN_IN_COPY = {
  title: "Sign in a device",
  lead: "Enter the code your terminal shows. You'll see which device is asking before you approve it.",
  codeLabel: "Device code",
  codeHint: "8 letters, shown in your terminal as XXXX-XXXX.",
  codePlaceholder: "XXXX-XXXX",
  incomplete: "Enter all 8 letters of the code.",
  continue: "Continue",
  requestTitle: "A device wants to sign in",
  requestLead: "Check that these details match the device you are signing in.",
  terms: {
    code: "Code",
    device: "Device",
    client: "Client",
    ip: "IP address",
    requested: "Requested",
    expires: "Code expires",
  },
  notRecorded: "Not recorded",
  warning: "Only approve if you started this sign-in yourself",
  warningDetail: "If someone sent you this code or link, deny it.",
  approve: "Approve",
  deny: "Deny",
  differentCode: "Use a different code",
  approved: "Device signed in. You can return to your terminal.",
  seeDevices: "See your devices",
  devicesHref: "/profile?tab=devices",
  denied: "Sign-in denied. The device was not signed in.",
  anotherCode: "Enter another code",
} as const;

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

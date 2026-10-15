import type {
  SessionStatus,
  SignInMethod,
  UserSession,
} from "@/services/types/sessions";

export const DEVICES_COPY = {
  activeTitle: "Active",
  activeDescription:
    "Browsers and CLIs signed in to your account. Revoke any you don't recognize.",
  endedTitle: "Ended (last 30 days)",
  endedEmpty: "No device has ended in the last 30 days.",
  thisDevice: "This device",
  revoke: "Revoke",
  revokeConfirm: "Revoke access",
  revokeBody:
    "It is signed out on its next request and has to sign in again to use Applika.",
  signOut: "Sign out",
  signOutTitle: "Sign out of this device?",
  signOutBody:
    "You are signed out here right away and taken to the login page.",
  signOutOthers: "Sign out all other devices",
  signOutOthersConfirm: "Sign out other devices",
  signOutOthersBody:
    "They are signed out on their next request and have to sign in again. This device stays signed in.",
  noOtherDevices: "No other device is signed in.",
  cancel: "Cancel",
  loading: "Loading devices",
  loadErrorTitle: "Could not load your devices",
  loadErrorBody: "Check your connection and try again.",
  retry: "Try again",
  emptyTitle: "No active devices",
  emptyBody: "Browsers and CLIs you sign in with appear here.",
  never: "Never",
  notRecorded: "Not recorded",
  terms: {
    client: "Client",
    method: "How it signed in",
    ip: "IP address",
    granted: "Granted",
    lastUsed: "Last used",
    expires: "Expires",
    ended: "Ended",
  },
} as const;

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  signed_out: "Signed out",
  revoked: "Revoked",
  expired: "Expired",
};

export const SIGN_IN_METHOD_LABEL: Record<SignInMethod, string> = {
  github_web: "GitHub in the browser",
  cli_browser: "Approved in the browser",
  cli_device: "Approved with a device code",
  cli_legacy: "Older CLI sign-in",
};

export function revokeTitle(deviceName: string): string {
  return `Revoke access for ${deviceName}?`;
}

export function signOutOthersTitle(count: number): string {
  return count === 1
    ? "Sign out 1 other device?"
    : `Sign out ${count} other devices?`;
}

export function signInIpLine(ip: string | null): string {
  return ip ? `Signed in from ${ip}` : "Sign-in IP not recorded";
}

/** An expired row may have no `ended_at`; the server orders it by `expires_at`. */
export function sessionEndedAt(session: UserSession): string {
  return session.ended_at ?? session.expires_at;
}

const DATE_TIME = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Oct 15, 2026, 2:32 PM", in the viewer's zone. */
export function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

import type {
  SessionStatus,
  SignInMethod,
  UserSession,
} from "@/services/types/sessions";
import { intlLocale } from "@/i18n/intl-locale";
import { liveCopy, word } from "@/i18n/translator";

/**
 * The Devices tab's words, in the active language (`devices.*`). The
 * components rendering them subscribe with `useLocale`, so a switch
 * re-renders them. Never spread a copy object: it would freeze the words.
 */
export const DEVICES_COPY = liveCopy("devices", [
  "activeTitle",
  "activeDescription",
  "endedTitle",
  "endedEmpty",
  "thisDevice",
  "revoke",
  "revokeConfirm",
  "revokeBody",
  "signOut",
  "signOutTitle",
  "signOutBody",
  "signOutOthers",
  "signOutOthersConfirm",
  "signOutOthersBody",
  "noOtherDevices",
  "cancel",
  "loading",
  "loadErrorTitle",
  "loadErrorBody",
  "retry",
  "emptyTitle",
  "emptyBody",
  "never",
  "notRecorded",
]);

export const DEVICE_TERMS = liveCopy("devices.terms", [
  "client",
  "method",
  "ip",
  "granted",
  "lastUsed",
  "expires",
  "ended",
]);

export const SESSION_STATUS_LABEL: Readonly<Record<SessionStatus, string>> =
  liveCopy("devices.status", ["active", "signed_out", "revoked", "expired"]);

export const SIGN_IN_METHOD_LABEL: Readonly<Record<SignInMethod, string>> =
  liveCopy("devices.method", [
    "borderless",
    "github_web",
    "cli_browser",
    "cli_device",
    "cli_legacy",
  ]);

/** The device name is data: shown as the API sends it, never translated. */
export function revokeTitle(deviceName: string): string {
  return word("devices.revokeTitle", { name: deviceName });
}

export function signOutOthersTitle(count: number): string {
  return word("devices.signOutOthersTitle", { count });
}

export function signInIpLine(ip: string | null): string {
  return ip
    ? word("devices.signInIp", { ip })
    : word("devices.signInIpMissing");
}

/** An expired row may have no `ended_at`; the server orders it by `expires_at`. */
export function sessionEndedAt(session: UserSession): string {
  return session.ended_at ?? session.expires_at;
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * "Oct 15, 2026, 2:32 PM" ("15 de out. de 2026, 14:32" in pt-BR), in the
 * viewer's zone and the active language. A component rendering it subscribes
 * (`useLocale`), so a switch re-renders the dates.
 */
export function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(intlLocale(), DATE_TIME_OPTIONS).format(date);
}

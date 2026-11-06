import { AxiosError } from "axios";

/** The words for a refused sign-in or membership confirm. */
export interface BorderlessErrorWords {
  message: string;
  /** 400 "CLI login expired": the terminal must start `applika login` again. */
  cliLoginExpired: boolean;
  status: number | null;
  code: string | null;
}

export const CLI_LOGIN_EXPIRED = "CLI login expired";
const FALLBACK = "Sign-in did not finish. Try again.";
const UNREACHABLE =
  "Could not reach applika. Check your connection and try again.";

/**
 * The server's own `detail`, word for word: 401 "Invalid email or password",
 * 403 `email_unverified`, 409 `binding_conflict` / `email_ambiguous`, 422
 * `email_unusable`, 429 with its wait, 503 "try again later". A raw
 * validation 422 (a `detail` array) or a body with no words gets a fixed line.
 */
export function borderlessErrorWords(error: unknown): BorderlessErrorWords {
  if (!(error instanceof AxiosError)) {
    return {
      message: FALLBACK,
      cliLoginExpired: false,
      status: null,
      code: null,
    };
  }
  const response = error.response;
  if (!response) {
    return {
      message: UNREACHABLE,
      cliLoginExpired: false,
      status: null,
      code: null,
    };
  }
  const data = response.data as { detail?: unknown; code?: unknown } | null;
  const detail =
    typeof data?.detail === "string" && data.detail.trim() ? data.detail : null;
  const code = typeof data?.code === "string" ? data.code : null;
  return {
    message: detail ?? FALLBACK,
    cliLoginExpired: response.status === 400 && detail === CLI_LOGIN_EXPIRED,
    status: response.status,
    code,
  };
}

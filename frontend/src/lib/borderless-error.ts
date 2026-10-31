import { AxiosError } from "axios";

import { translate } from "@/i18n/translator";
import { apiErrorCode, serverErrorMessage } from "@/lib/api-error-message";

/** The words for a refused sign-in or membership confirm. */
export interface BorderlessErrorWords {
  message: string;
  /** 400 AUTH-1019 "CLI login expired": the terminal must start `applika login` again. */
  cliLoginExpired: boolean;
  status: number | null;
  code: string | null;
}

/** The code of the 400 "CLI login expired" (`docs/error-codes.md`). */
export const CLI_LOGIN_EXPIRED_CODE = "AUTH-1019";

function fallback(): string {
  return (
    translate("auth.signInFallback") ?? "Sign-in did not finish. Try again."
  );
}

function unreachable(): string {
  return (
    translate("auth.unreachable") ??
    "Could not reach applika. Check your connection and try again."
  );
}

/**
 * The words for a refusal, in the active language, by code
 * (`lib/api-error-message.ts`): 401 AUTH-1004, 403 AUTH-1005, 409 AUTH-1006 /
 * AUTH-1007 / AUTH-1010, 422 AUTH-1008, 429 AUTH-1009 with its wait, 503
 * AUTH-1017. An unknown code shows the API's `detail`; a raw validation 422
 * (GEN-1003) is one line; a body with no words gets a fixed line.
 */
export function borderlessErrorWords(error: unknown): BorderlessErrorWords {
  if (!(error instanceof AxiosError)) {
    return {
      message: fallback(),
      cliLoginExpired: false,
      status: null,
      code: null,
    };
  }
  const response = error.response;
  if (!response) {
    return {
      message: unreachable(),
      cliLoginExpired: false,
      status: null,
      code: null,
    };
  }
  const code = apiErrorCode(response.data);
  return {
    message: serverErrorMessage(response.data) ?? fallback(),
    cliLoginExpired: response.status === 400 && code === CLI_LOGIN_EXPIRED_CODE,
    status: response.status,
    code,
  };
}

import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deviceErrorText } from "@/app/(protected)/device/device-page";
import { safeErrorMessage } from "@/components/application-drafts/draft-copy";
import { jobApiDetail } from "@/hooks/use-jobs";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import { setTranslatorLocale } from "@/i18n/translator";

/**
 * The screens' own error readers, which used to read `detail` directly, go
 * through `lib/api-error-message.ts`: a known code reads in the active
 * language, an unknown one shows `detail`, no words shows the screen's own
 * fallback.
 */
vi.mock("@/services/services", () => ({ services: {} }));

function refused(data: unknown) {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    statusText: "409",
    headers: new AxiosHeaders(),
    config: {} as never,
    data,
  });
}

const known = refused({
  detail: "A platform with this name already exists: LinkedIn",
  code: "CAT-1003",
  params: { name: "LinkedIn" },
});

const readers = [
  ["jobApiDetail", jobApiDetail],
  ["safeErrorMessage", safeErrorMessage],
  ["deviceErrorText", deviceErrorText],
] as const;

afterEach(() => setTranslatorLocale(DEFAULT_LOCALE, en));

describe.each(readers)("%s", (_, reader) => {
  it("a known code reads in Portuguese, its params filled in", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    expect(reader(known)).toBe(
      "Já existe uma plataforma com este nome: LinkedIn",
    );
  });

  it("an unknown code shows the detail; no words, the screen's fallback", () => {
    expect(reader(refused({ detail: "New words", code: "NEW-1001" }))).toBe(
      "New words",
    );
    expect(reader(refused({ detail: [{ msg: "x" }] }))).toBe(
      "Something went wrong. Try again.",
    );
  });
});

import type { Locale } from "@/i18n/config";
import en from "@/i18n/messages/en.json";
import type { Messages } from "@/i18n/translator";

let portuguese: Messages | null = null;

/**
 * The messages of `locale`. English ships in the main bundle (it is the
 * first render of every page, static export included); Portuguese is a
 * separate chunk, fetched once on the first switch or resolve to `pt-BR`.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "en") return en;
  if (!portuguese) {
    portuguese = (await import("@/i18n/messages/pt-BR.json")).default;
  }
  return portuguese;
}

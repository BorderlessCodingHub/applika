import { useLocale } from "next-intl";

/**
 * A number written the way the app language writes it. Portuguese gets
 * `Intl` (`1.234,5`); English keeps the plain digits the screens have always
 * shown (`String(value)`, or `toFixed` when `fractionDigits` is given), so
 * English output stays byte-identical.
 */
export function formatNumber(
  value: number,
  locale: string,
  fractionDigits?: number,
): string {
  if (locale !== "pt-BR") {
    return fractionDigits === undefined
      ? String(value)
      : value.toFixed(fractionDigits);
  }
  return new Intl.NumberFormat(
    "pt-BR",
    fractionDigits === undefined
      ? { maximumFractionDigits: 20 }
      : {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        },
  ).format(value);
}

/** `formatNumber` bound to the active language; subscribes, so a switch re-renders. */
export function useFormatNumber(): (
  value: number,
  fractionDigits?: number,
) => string {
  const locale = useLocale();
  return (value, fractionDigits) => formatNumber(value, locale, fractionDigits);
}

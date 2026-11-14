import { describe, expect, it } from "vitest";

import {
  localeCookieString,
  readLocaleCookie,
  resolveLocale,
} from "@/i18n/resolve-locale";

describe("resolveLocale", () => {
  it("a saved en or pt-BR cookie wins over the browser languages", () => {
    expect(resolveLocale("en", ["pt-BR", "pt"])).toBe("en");
    expect(resolveLocale("pt-BR", ["en-US", "fr"])).toBe("pt-BR");
  });

  it.each(["fr", "pt", "PT-BR", "pt_BR", "en-US", "", "  en", "%%%"])(
    "ignores the cookie value %j and lets the browser decide",
    (cookie) => {
      expect(resolveLocale(cookie, ["pt-PT"])).toBe("pt-BR");
      expect(resolveLocale(cookie, ["de-DE"])).toBe("en");
    },
  );

  it.each([["pt"], ["pt-PT"], ["pt-BR"], ["PT-br"]])(
    "a browser set to %s gets Portuguese (Brazil)",
    (language) => {
      expect(resolveLocale(null, [language])).toBe("pt-BR");
    },
  );

  it("any Portuguese entry among the preferred languages is enough", () => {
    expect(resolveLocale(null, ["en-US", "fr", "pt-PT"])).toBe("pt-BR");
  });

  it("every other browser gets English", () => {
    expect(resolveLocale(null, ["fr"])).toBe("en");
    expect(resolveLocale(null, ["es-ES", "it"])).toBe("en");
    // "ptx" is not Portuguese.
    expect(resolveLocale(null, ["ptx"])).toBe("en");
  });

  it("no cookie and no languages: English", () => {
    expect(resolveLocale(null, [])).toBe("en");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });
});

describe("readLocaleCookie", () => {
  it("reads NEXT_LOCALE among other cookies", () => {
    expect(readLocaleCookie("a=1; NEXT_LOCALE=pt-BR; b=2")).toBe("pt-BR");
    expect(readLocaleCookie("NEXT_LOCALE=en")).toBe("en");
  });

  it("is null when absent, and never matches a longer name", () => {
    expect(readLocaleCookie("")).toBeNull();
    expect(readLocaleCookie("X_NEXT_LOCALE=en; NEXT_LOCALE_OLD=en")).toBeNull();
  });

  it("returns a garbage value as is (resolveLocale ignores it)", () => {
    expect(readLocaleCookie("NEXT_LOCALE=%E0%A4%A")).toBeNull();
    expect(readLocaleCookie("NEXT_LOCALE=fr")).toBe("fr");
  });
});

describe("localeCookieString", () => {
  it("one year, every path, SameSite=Lax, not HttpOnly", () => {
    expect(localeCookieString("pt-BR")).toBe(
      "NEXT_LOCALE=pt-BR; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(localeCookieString("en")).not.toMatch(/HttpOnly/i);
  });
});

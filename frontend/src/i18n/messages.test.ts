import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

/**
 * The two message files stay twins, and `errors.*` stays the API's error
 * catalog: one message per code in `applika/docs/error-codes.md` (plus
 * `errors.unknown`), each naming exactly that code's params as ICU
 * arguments. A missing catalog FAILS the suite, naming the path; it never
 * skips, so a moved file cannot silently turn the check off.
 */
const CATALOG = resolve(__dirname, "../../../docs/error-codes.md");

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const entry of flatten(value, path)) out.set(...entry);
  }
  return out;
}

/** The top-level ICU argument names of a message (`{name}`, `{count, plural, …}`). */
function icuArgs(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const char = message[i];
    if (char === "{") {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/.exec(
          message.slice(i),
        );
        if (match) names.add(match[1]);
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
  }
  return [...names].sort();
}

/** Rich-text tags (`<link>…</link>`) a message expects. */
function tags(message: string): string[] {
  return [...message.matchAll(/<([a-z]+)>/g)].map((m) => m[1]).sort();
}

type CatalogRow = { code: string; params: string[] };

/**
 * Rows of the `## Codes` table: `| code | status | detail | params | … |`.
 * The status may be `other` (GEN-1008); the detail is a backticked message
 * with `<name>` values, or a parenthesised note (GEN-1003, GEN-1008).
 */
function parseCatalog(text: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (!/^[A-Z]+-\d{4}$/.test(cells[1] ?? "")) continue;
    const [, code, status, detail, params] = cells;
    expect(status, `${code} status`).toMatch(/^(\d{3}|other)$/);
    expect(detail, `${code} detail`).toMatch(/^(`.+`|\(.+\))$/);
    const named =
      params === "—"
        ? []
        : params.split(",").map((p) => p.replace(/`/g, "").trim());
    if (detail.startsWith("`")) {
      const inDetail = [...detail.matchAll(/<([a-z_]+)>/g)].map((m) => m[1]);
      expect([...new Set(inDetail)].sort(), `${code} detail values`).toEqual(
        [...named].sort(),
      );
    }
    rows.push({ code, params: named.sort() });
  }
  return rows;
}

const enFlat = flatten(en as Tree);
const ptFlat = flatten(ptBR as Tree);

describe("messages: en and pt-BR are twins", () => {
  it("have the same keys", () => {
    expect([...ptFlat.keys()].sort()).toEqual([...enFlat.keys()].sort());
  });

  it("have no empty value", () => {
    for (const [key, value] of [...enFlat, ...ptFlat]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("name the same ICU arguments and rich-text tags per key", () => {
    for (const [key, value] of enFlat) {
      const twin = ptFlat.get(key) ?? "";
      expect(icuArgs(twin), key).toEqual(icuArgs(value));
      expect(tags(twin), key).toEqual(tags(value));
    }
  });

  it("carry the reference switcher's keys", () => {
    for (const key of [
      "header.toggleLanguage",
      "header.switchToEnglish",
      "header.switchToPortuguese",
      "icons.flagUs",
      "icons.flagBr",
    ]) {
      expect(enFlat.has(key), key).toBe(true);
    }
    expect(enFlat.get("header.toggleLanguage")).toBe("Toggle language");
  });
});

describe("messages: errors.* is the API's error catalog", () => {
  it("finds the catalog", () => {
    expect(existsSync(CATALOG), `missing ${CATALOG}`).toBe(true);
  });

  const catalog = existsSync(CATALOG)
    ? parseCatalog(readFileSync(CATALOG, "utf8"))
    : [];

  it("lists the 124 codes", () => {
    expect(catalog).toHaveLength(124);
  });

  it("has one message per code, plus errors.unknown, in both languages", () => {
    const expected = [
      ...catalog.map((row) => `errors.${row.code}`),
      "errors.unknown",
    ].sort();
    const errorKeys = (flat: Map<string, string>) =>
      [...flat.keys()].filter((key) => key.startsWith("errors.")).sort();
    expect(errorKeys(enFlat)).toEqual(expected);
    expect(errorKeys(ptFlat)).toEqual(expected);
  });

  it("each message's ICU arguments are exactly its code's params", () => {
    for (const row of catalog) {
      const key = `errors.${row.code}`;
      expect(icuArgs(enFlat.get(key) ?? ""), `en ${key}`).toEqual(row.params);
      expect(icuArgs(ptFlat.get(key) ?? ""), `pt-BR ${key}`).toEqual(
        row.params,
      );
    }
  });

  it("en keeps the API's English words", () => {
    const text = existsSync(CATALOG) ? readFileSync(CATALOG, "utf8") : "";
    for (const line of text.split("\n")) {
      const cells = line.split("|").map((cell) => cell.trim());
      if (!/^[A-Z]+-\d{4}$/.test(cells[1] ?? "")) continue;
      const literal = /^`(.+)`$/.exec(cells[3]);
      if (!literal) continue;
      expect(enFlat.get(`errors.${cells[1]}`), cells[1]).toBe(
        literal[1].replace(/<([a-z_]+)>/g, "{$1}"),
      );
    }
  });

  it("the old named codes are numbered and keep their English words", () => {
    expect(enFlat.get("errors.AUTH-1005")).toBe(
      "Verify your email on Borderless first",
    );
    expect(enFlat.get("errors.RPT-1001")).toBe(
      "Reports are for Borderless BASE and PSP members",
    );
    expect(enFlat.get("errors.RPT-1002")).toBe(
      "Sign in again to confirm your membership",
    );
    for (const old of [
      "email_unverified",
      "binding_conflict",
      "email_ambiguous",
      "email_unusable",
      "badge_required",
      "membership_unconfirmed",
    ]) {
      expect(enFlat.has(`errors.${old}`), old).toBe(false);
    }
  });
});

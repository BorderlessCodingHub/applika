import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the colour tokens of `globals.css` to the original teal palette
 * (ADR-0022, amending ADR-0006). The original was written in HSL; the tokens
 * are written in oklch. Every oklch literal is converted back to sRGB here
 * (CSS Color 4: OKLCH -> OKLab -> LMS -> linear sRGB -> gamma) and compared
 * with the original HSL converted to sRGB, channel by channel, within
 * 1.5/255. Alpha is checked only where a rule names it.
 *
 * The converter below is also the only source of the oklch numbers: each
 * literal must be exactly `canonicalOklch(hsl)` (L and C to 3 decimals, H to
 * 1 decimal, achromatic "L 0 0"). A value changes only with an ADR.
 */

// ---------------------------------------------------------------------------
// Converter (CSS Color 4, Ottosson's OKLab matrices)
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

/** `"h s% l%"` -> gamma-encoded sRGB, each channel 0..1 (CSS Color 4 hslToRgb). */
export function hslToSrgb(hsl: string): Rgb {
  const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(hsl.trim());
  if (!m) throw new Error(`not an HSL triple: ${hsl}`);
  const h = (((Number(m[1]) % 360) + 360) % 360) / 1;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const toLinear = (c: number) => {
  const abs = Math.abs(c);
  const v = abs <= 0.04045 ? abs / 12.92 : ((abs + 0.055) / 1.055) ** 2.4;
  return Math.sign(c) * v;
};

const toGamma = (c: number) => {
  const abs = Math.abs(c);
  const v = abs <= 0.0031308 ? abs * 12.92 : 1.055 * abs ** (1 / 2.4) - 0.055;
  return Math.sign(c) * v;
};

/** oklch -> gamma-encoded sRGB (unclamped), each channel 0..1. */
export function oklchToSrgb(L: number, C: number, H: number): Rgb {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** gamma-encoded sRGB -> [L, C, H]. */
export function srgbToOklch([r, g, bl]: Rgb): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(bl);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, b);
  const H = ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  return [L, C, H];
}

const trim = (n: number, digits: number) => {
  const v = Number(n.toFixed(digits));
  return String(Object.is(v, -0) ? 0 : v);
};

/** Largest per-channel gap, in sRGB 0..1, between two colours. */
function maxChannelGap(a: Rgb, b: Rgb): number {
  return Math.max(...a.map((c, i) => Math.abs(c - b[i])));
}

/** Per-channel sRGB tolerance between an oklch literal and its original. */
export const TOLERANCE = 1.5 / 255;

/**
 * The `L C H` text a token takes for an original HSL triple: L and C rounded
 * to 3 decimals, H to 1 decimal, achromatic `L 0 0`. When plain rounding
 * lands outside {@link TOLERANCE} (a channel near 0 is steep in oklch), the
 * closest point of the same 3/3/1-decimal grid around it is taken instead.
 */
export function canonicalOklch(hsl: string): string {
  const want = hslToSrgb(hsl);
  const [L, C, H] = srgbToOklch(want);
  const saturation = Number(/^\S+\s+([\d.]+)%/.exec(hsl.trim())?.[1]);
  if (saturation === 0) return `${trim(L, 3)} 0 0`;
  const rl = Number(L.toFixed(3));
  const rc = Number(C.toFixed(3));
  const rh = Number(H.toFixed(1)) % 360;
  let best: [number, number, number] = [rl, rc, rh];
  let bestGap = maxChannelGap(oklchToSrgb(rl, rc, rh), want);
  if (bestGap > TOLERANCE) {
    for (const dl of [-0.001, 0, 0.001]) {
      for (const dc of [-0.001, 0, 0.001]) {
        for (const dh of [-0.1, 0, 0.1]) {
          const cand: [number, number, number] = [
            Number((rl + dl).toFixed(3)),
            Number((rc + dc).toFixed(3)),
            Number((rh + dh).toFixed(1)),
          ];
          const gap = maxChannelGap(oklchToSrgb(...cand), want);
          if (gap < bestGap) {
            best = cand;
            bestGap = gap;
          }
        }
      }
    }
  }
  return `${trim(best[0], 3)} ${trim(best[1], 3)} ${trim(best[2], 1)}`;
}

/** `#rrggbb` for an original HSL triple. */
export function hslToHex(hsl: string): string {
  return `#${hslToSrgb(hsl)
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// ---------------------------------------------------------------------------
// The pinned palette (original 9661a38 globals.css l.312-415, HSL)
// ---------------------------------------------------------------------------

/** token -> [light, dark] original HSL. */
const ORIGINAL: Record<string, [string, string]> = {
  background: ["40 18% 96%", "228 22% 8%"],
  foreground: ["225 25% 12%", "40 12% 90%"],
  card: ["40 20% 99%", "228 20% 11%"],
  primary: ["168 65% 38%", "168 70% 48%"],
  "primary-foreground": ["0 0% 100%", "228 22% 8%"],
  secondary: ["40 12% 93%", "228 16% 15%"],
  "secondary-foreground": ["225 20% 18%", "40 10% 82%"],
  muted: ["40 10% 91%", "228 16% 15%"],
  "muted-foreground": ["225 10% 45%", "228 10% 50%"],
  accent: ["168 45% 94%", "228 18% 17%"],
  "accent-foreground": ["168 65% 28%", "40 12% 90%"],
  destructive: ["0 65% 48%", "0 55% 45%"],
  "destructive-foreground": ["0 0% 100%", "0 0% 100%"],
  success: ["160 60% 40%", "168 60% 42%"],
  warning: ["38 90% 50%", "38 90% 50%"],
  border: ["40 12% 88%", "228 14% 18%"],
  // the original `--sidebar-background`
  sidebar: ["40 18% 98%", "228 22% 9%"],
  "sidebar-accent": ["168 45% 94%", "228 18% 15%"],
  "sidebar-border": ["40 12% 90%", "228 14% 16%"],
  // ADR-0022: no twin in the original, a fixed value on the original hues
  "border-strong": ["40 12% 82%", "228 14% 24%"],
};

/** token -> the token whose original value it takes ("= x"), both themes. */
const SAME_AS: Record<string, string> = {
  "card-foreground": "foreground",
  "popover-foreground": "foreground",
  popover: "card",
  input: "border",
  ring: "primary",
  "sidebar-primary": "primary",
  "sidebar-ring": "primary",
  "sidebar-foreground": "muted-foreground",
  "sidebar-primary-foreground": "primary-foreground",
  "sidebar-accent-foreground": "accent-foreground",
  // ADR-0022 derived rules
  surface: "card",
  "surface-elevated": "popover",
  "primary-muted": "primary",
  info: "primary",
  "chart-1": "primary",
  "chart-2": "success",
  "chart-3": "warning",
  "chart-4": "destructive",
  "chart-5": "muted-foreground",
};

/** token -> the alpha its rule names. Every other token is opaque. */
const ALPHA: Record<string, number> = { "primary-muted": 0.12 };

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

function originalHsl(token: string, theme: Theme): string {
  let name = token;
  while (SAME_AS[name]) name = SAME_AS[name];
  const pair = ORIGINAL[name];
  if (!pair) throw new Error(`no original value for --${token}`);
  return pair[theme === "light" ? 0 : 1];
}

// ---------------------------------------------------------------------------
// Source parsing
// ---------------------------------------------------------------------------

const APP_DIR = path.resolve(__dirname);
const css = readFileSync(path.join(APP_DIR, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const layout = readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");

/** The body of the first `{ ... }` block opened at or after `from`. */
function blockBody(source: string, from: number): string {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("unbalanced block");
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

const firstBase = blockBody(css, css.indexOf("@layer base"));
const TOKENS: Record<Theme, Record<string, string>> = {
  light: declarations(blockBody(firstBase, firstBase.indexOf(":root"))),
  dark: declarations(blockBody(firstBase, firstBase.indexOf(".dark"))),
};
const THEME_BLOCK = declarations(blockBody(css, css.indexOf("@theme")));

interface Oklch {
  text: string;
  L: number;
  C: number;
  H: number;
  alpha: number;
}

const OKLCH_RE =
  /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/g;

function parseOklchs(value: string): Oklch[] {
  return [...value.matchAll(OKLCH_RE)].map((m) => ({
    text: `${m[1]} ${m[2]} ${m[3]}`,
    L: Number(m[1]),
    C: Number(m[2]),
    H: Number(m[3]),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }));
}

function expectSameColour(actual: Oklch, hsl: string, label: string) {
  const got = oklchToSrgb(actual.L, actual.C, actual.H);
  const want = hslToSrgb(hsl);
  for (let i = 0; i < 3; i++) {
    expect(
      Math.abs(got[i] - want[i]),
      `${label}: oklch(${actual.text}) channel ${"rgb"[i]} is ${(got[i] * 255).toFixed(2)}, hsl(${hsl}) is ${(want[i] * 255).toFixed(2)} (want oklch(${canonicalOklch(hsl)}))`,
    ).toBeLessThanOrEqual(TOLERANCE);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("converter (CSS Color 4)", () => {
  it("round-trips sRGB through oklch", () => {
    for (const hsl of [
      "168 65% 38%",
      "0 0% 100%",
      "228 22% 8%",
      "38 90% 50%",
    ]) {
      const [L, C, H] = srgbToOklch(hslToSrgb(hsl));
      const back = oklchToSrgb(L, C, H);
      hslToSrgb(hsl).forEach((c, i) => expect(back[i]).toBeCloseTo(c, 4));
    }
  });

  it("matches known reference values", () => {
    expect(hslToHex("0 0% 100%")).toBe("#ffffff");
    expect(hslToHex("0 100% 50%")).toBe("#ff0000");
    // CSS Color 4 example: sRGB red is oklch(0.628 0.258 29.2)
    expect(canonicalOklch("0 100% 50%")).toBe("0.628 0.258 29.2");
    expect(canonicalOklch("0 0% 100%")).toBe("1 0 0");
  });
});

describe.each(THEMES)("%s palette tokens", (theme) => {
  const tokens = TOKENS[theme];
  const pinned = [...Object.keys(ORIGINAL), ...Object.keys(SAME_AS)];

  it.each(pinned)(`--%s takes its original ${theme} value`, (token) => {
    const value = tokens[token];
    expect(value, `--${token} is missing in ${theme}`).toBeDefined();
    const colours = parseOklchs(value);
    expect(colours, `--${token}: ${value}`).toHaveLength(1);
    const [colour] = colours;
    const hsl = originalHsl(token, theme);
    expectSameColour(colour, hsl, `${theme} --${token}`);
    expect(
      colour.text,
      `${theme} --${token} is not the converter's value`,
    ).toBe(canonicalOklch(hsl));
    expect(colour.alpha, `${theme} --${token} alpha`).toBe(ALPHA[token] ?? 1);
  });

  it("pins every colour token it declares", () => {
    const colourTokens = Object.entries(tokens)
      .filter(([name, v]) => !name.startsWith("shadow") && /oklch\(/.test(v))
      .map(([name]) => name);
    expect(colourTokens.filter((t) => !pinned.includes(t))).toEqual([]);
  });

  it("does not port the original-only tokens", () => {
    for (const gone of [
      "success-foreground",
      "warning-foreground",
      "shadow-panel",
      "sidebar-background",
    ]) {
      expect(tokens[gone], `--${gone}`).toBeUndefined();
    }
  });
});

describe("radius", () => {
  it("stays 0.5rem", () => {
    expect(TOKENS.light.radius).toBe("0.5rem");
  });
});

describe("shadows", () => {
  it("keeps the light shadows (already equal to the original)", () => {
    expect(TOKENS.light["shadow-card"]).toBe(
      "0 1px 2px oklch(0 0 0 / 0.04), 0 0 0 1px oklch(0 0 0 / 0.03)",
    );
    expect(TOKENS.light["shadow-elevated"]).toBe(
      "0 8px 30px -4px oklch(0 0 0 / 0.08), 0 0 0 1px oklch(0 0 0 / 0.04)",
    );
  });

  it("restores the original dark shadows", () => {
    expect(TOKENS.dark["shadow-card"]).toBe(
      "0 0 0 1px oklch(1 0 0 / 0.04), 0 2px 8px -1px oklch(0 0 0 / 0.4)",
    );
    expect(TOKENS.dark["shadow-elevated"]).toBe(
      "0 8px 32px -4px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.05)",
    );
  });

  it("restores the original glow: dark primary / 0.25", () => {
    const glow = THEME_BLOCK["shadow-glow"];
    expect(glow).toMatch(/^0 0 24px -4px oklch\([^)]*\)$/);
    const [colour] = parseOklchs(glow);
    expectSameColour(colour, ORIGINAL.primary[1], "--shadow-glow");
    expect(colour.text).toBe(canonicalOklch(ORIGINAL.primary[1]));
    expect(colour.alpha).toBe(0.25);
  });
});

describe("gradient-mesh", () => {
  const start = css.indexOf("@utility gradient-mesh");
  const body = blockBody(css, start);
  const darkAt = body.indexOf(".dark &");
  const light = parseOklchs(body.slice(0, darkAt));
  const dark = parseOklchs(body.slice(darkAt));

  const STOPS: Record<Theme, [string, number][]> = {
    light: [
      ["168 65% 38%", 0.08],
      ["200 60% 50%", 0.06],
      ["40 30% 50%", 0.03],
    ],
    dark: [
      ["168 70% 48%", 0.08],
      ["200 60% 50%", 0.05],
      ["260 40% 50%", 0.04],
    ],
  };

  it.each(THEMES)("restores the original %s stops", (theme) => {
    const colours = theme === "light" ? light : dark;
    expect(colours).toHaveLength(3);
    STOPS[theme].forEach(([hsl, alpha], i) => {
      expectSameColour(colours[i], hsl, `${theme} mesh stop ${i + 1}`);
      expect(colours[i].text).toBe(canonicalOklch(hsl));
      expect(colours[i].alpha).toBe(alpha);
    });
  });
});

describe("browser theme colour", () => {
  it("is the original dark background", () => {
    const m = /themeColor:\s*"(#[0-9a-fA-F]{6})"/.exec(layout);
    expect(m?.[1].toLowerCase()).toBe(hslToHex(ORIGINAL.background[1]));
  });
});

describe("blue identity", () => {
  it("leaves no oklch() literal with hue 255", () => {
    const hits = [...css.matchAll(OKLCH_RE)]
      .filter((m) => Math.round(Number(m[3])) === 255)
      .map((m) => m[0]);
    expect(hits).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The phone pattern sheet (ADR-0027): the V2 boards' stylesheet ported whole,
 * every class prefixed `ph-`, reading the `globals.css` tokens. jsdom applies
 * no stylesheet, so what is pinned here is the source: the classes exist, the
 * file is imported, and no rule can match a desktop page (every selector
 * needs a `ph-` class), which keeps md and up as it is.
 */

const css = readFileSync(path.join(__dirname, "phone.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const globals = readFileSync(
  path.join(__dirname, "..", "app", "globals.css"),
  "utf8",
);

/** Every rule's selector list, at any depth (`@layer`, `@media`). */
function selectors(source: string): string[] {
  const found: string[] = [];
  const re = /([^{};]+)\{/g;
  for (const match of source.matchAll(re)) {
    const header = match[1].trim();
    if (header.startsWith("@")) continue;
    found.push(header.replace(/\s+/g, " "));
  }
  return found;
}

/** The body of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `no rule for ${selector}`).not.toBeNull();
  return match![1];
}

const ALL_SELECTORS = selectors(css);
const KEYFRAME_STEPS = /^(from|to|\d+%)$/;
const DECLARED = new Set(
  ALL_SELECTORS.flatMap((s) =>
    [...s.matchAll(/\.(ph-[a-z0-9-]+)/g)].map((m) => m[1]),
  ),
);

// The shared classes of the boards (in 18+ of them, identical bodies), the
// tab-root chrome (avatar, fab), the Account board's own (beta, ic), the
// sign-in ones (mesh, dots, spin), the modifiers, and the 44px hit box.
const PINNED = [
  "ph-app",
  "ph-mono",
  "ph-scroll",
  "ph-hs",
  "ph-sr",
  "ph-top",
  "ph-back",
  "ph-h1",
  "ph-h2",
  "ph-lead",
  "ph-card",
  "ph-group",
  "ph-row",
  "ph-grow",
  "ph-meta",
  "ph-gh",
  "ph-btn",
  "ph-pri",
  "ph-sec",
  "ph-dan",
  "ph-sm",
  "ph-iconbtn",
  "ph-chip",
  "ph-on",
  "ph-tag",
  "ph-pill",
  "ph-ok",
  "ph-warn",
  "ph-bad",
  "ph-dot",
  "ph-field",
  "ph-lbl",
  "ph-input",
  "ph-hint",
  "ph-bar",
  "ph-seg",
  "ph-scrim",
  "ph-sheet",
  "ph-grab",
  "ph-opt",
  "ph-radio",
  "ph-switch",
  "ph-dl",
  "ph-tabbar",
  "ph-tab",
  "ph-fab",
  "ph-avatar",
  "ph-beta",
  "ph-ic",
  "ph-mesh",
  "ph-dots",
  "ph-spin",
  "ph-hit",
] as const;

/** The bodies of every rule whose selector is exactly `selector`, in order. */
function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[1]);
}

/** A `clamp(min, Nvw, max)` length at a viewport `width`, in px. */
function clampAt(value: string, width: number): number {
  const match =
    /clamp\(\s*(\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)vw,\s*(\d+(?:\.\d+)?)px\s*\)/.exec(
      value,
    );
  expect(match, `not a px/vw/px clamp: ${value}`).not.toBeNull();
  const [min, vw, max] = match!.slice(1).map(Number);
  return Math.min(max, Math.max(min, (vw * width) / 100));
}

// Sign-in option C (C_Mobile, C_Desktop), v2/Landing, v2/CookiePolicy,
// v2/CliCode and v2/DeviceSignIn: each board's own <style> classes, the
// boards' inline style blocks made classes, and what the app adds to them.
const BOARD_ONLY = [
  "ph-c-glow",
  "ph-app-ic",
  "ph-c-badge",
  "ph-c-side",
  "ph-c-side-glow",
  "ph-app-ic-lg",
  "ph-c-badge-lg",
  "ph-feat",
  "ph-doc",
  "ph-ck",
] as const;

const INLINE_BLOCKS = [
  "ph-c-main",
  "ph-c-headline",
  "ph-signin-alert",
  "ph-signin-hint",
  "ph-landing-header",
  "ph-landing-hero",
  "ph-landing-eyebrow",
  "ph-landing-h1",
  "ph-landing-lead",
  "ph-landing-preview",
  "ph-landing-preview-card",
  "ph-landing-preview-tile",
  "ph-landing-stage",
  "ph-landing-event",
  "ph-landing-stats",
  "ph-landing-features",
  "ph-landing-feature-tile",
  "ph-landing-steps",
  "ph-landing-quote",
  "ph-landing-open",
  "ph-landing-footer",
  "ph-landing-cta",
  "ph-landing-cta-btn",
  "ph-cli-code",
  "ph-device-code",
  "ph-device-note",
] as const;

const ADAPTATIONS = ["ph-safe-bottom", "ph-below-top", "ph-pair"] as const;

describe("phone.css", () => {
  it("is imported by globals.css", () => {
    expect(globals).toMatch(/@import\s+"\.\.\/styles\/phone\.css";/);
  });

  it.each(PINNED)("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("matches nothing without a ph- class, so md and up is untouched", () => {
    const loose = ALL_SELECTORS.flatMap((list) => list.split(","))
      .map((s) => s.trim())
      .filter((s) => s !== ":root" && s !== ".dark")
      .filter((s) => !KEYFRAME_STEPS.test(s))
      .filter((s) => !/\.ph-[a-z0-9-]+/.test(s));
    expect(loose).toEqual([]);
  });

  it("names no class outside the ph- prefix", () => {
    const foreign = ALL_SELECTORS.flatMap((s) =>
      [...s.matchAll(/\.(-?[a-z][a-z0-9-]*)/g)].map((m) => m[1]),
    ).filter((name) => !name.startsWith("ph-") && name !== "dark");
    expect(foreign).toEqual([]);
  });

  it("reads the app's colour tokens, never a literal colour", () => {
    const literal = css.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/gi) ?? [];
    expect(literal).toEqual([]);
  });

  it("uses the app's self-hosted fonts", () => {
    expect(ruleBody(".ph-app")).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(ruleBody(".ph-mono")).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(css).not.toMatch(/"Inter"|"JetBrains Mono"/);
  });

  it("keeps the glow local: none in light, the theme glow in dark", () => {
    expect(ruleBody(":root")).toMatch(/--ph-glow:\s*none/);
    expect(ruleBody(".dark")).toMatch(/--ph-glow:\s*var\(--shadow-glow\)/);
  });

  it("spins, and stops spinning under reduced motion", () => {
    expect(css).toMatch(/@keyframes ph-spin\s*\{/);
    expect(ruleBody(".ph-spin")).toMatch(/animation:\s*ph-spin 0\.9s linear/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ph-spin\s*\{\s*animation:\s*none;?\s*\}/,
    );
  });

  it("keeps the fixed chrome under the portal layer, above the bottom inset", () => {
    for (const chrome of [".ph-tabbar", ".ph-fab", ".ph-bar"]) {
      const bodies = [
        ...css.matchAll(new RegExp(`\\${chrome}\\s*\\{([^}]*)\\}`, "g")),
      ]
        .map((m) => m[1])
        .join("\n");
      expect(bodies, chrome).toMatch(/position:\s*fixed/);
      expect(bodies, chrome).toMatch(/z-index:\s*40/);
      expect(bodies, chrome).toMatch(/env\(safe-area-inset-bottom, 0px\)/);
    }
    for (const portal of [".ph-scrim", ".ph-sheet"]) {
      const bodies = [
        ...css.matchAll(new RegExp(`\\${portal}\\s*\\{([^}]*)\\}`, "g")),
      ]
        .map((m) => m[1])
        .join("\n");
      expect(bodies, portal).toMatch(/z-index:\s*50/);
    }
  });

  it("draws the tab bar, the FAB and the avatar at the boards' sizes", () => {
    expect(css).toMatch(/\.ph-tabbar\s*\{[^}]*height:\s*64px/);
    expect(css).toMatch(
      /\.ph-tabbar\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    );
    expect(css).toMatch(/\.ph-fab\s*\{[^}]*height:\s*52px/);
    expect(css).toMatch(/\.ph-avatar\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.ph-avatar span\s*\{[^}]*width:\s*38px/);
  });

  it("gives every shape drawn under 44px a 44px box", () => {
    expect(css).toMatch(
      /\.ph-hit\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
    );
    expect(css).toMatch(
      /\.ph-btn\.ph-sm,\s*\.ph-chip,\s*\.ph-seg > \*,\s*\.ph-switch\s*\{[^}]*height:\s*44px/,
    );
  });
});

describe("phone.css: the sign-in, public and CLI boards", () => {
  it.each([...BOARD_ONLY, ...INLINE_BLOCKS, ...ADAPTATIONS])(
    "declares .%s",
    (name) => {
      expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
    },
  );

  it("draws C_Mobile's app icon and badge at the board's sizes", () => {
    const icon = ruleBody(".ph-app-ic");
    expect(icon).toMatch(/width:\s*104px/);
    expect(icon).toMatch(/height:\s*104px/);
    expect(icon).toMatch(/border-radius:\s*30px/);
    const badge = ruleBody(".ph-c-badge");
    expect(badge).toMatch(/width:\s*46px/);
    expect(badge).toMatch(/right:\s*-14px/);
    expect(badge).toMatch(/bottom:\s*-14px/);
    expect(badge).toMatch(/box-shadow:\s*0 0 0 4px var\(--background\)/);
    expect(ruleBody(".ph-c-badge img")).toMatch(/width:\s*100%/);
  });

  it("draws C_Desktop's side panel, icon, badge and features at the board's sizes", () => {
    const icon = ruleBody(".ph-app-ic-lg");
    expect(icon).toMatch(/width:\s*120px/);
    expect(icon).toMatch(/border-radius:\s*34px/);
    const badge = ruleBody(".ph-c-badge-lg");
    expect(badge).toMatch(/width:\s*54px/);
    expect(badge).toMatch(/right:\s*-16px/);
    expect(badge).toMatch(/box-shadow:\s*0 0 0 5px var\(--background\)/);
    expect(ruleBody(".ph-c-badge-lg img")).toMatch(/height:\s*100%/);
    expect(ruleBody(".ph-c-side")).toMatch(/border-right:\s*1px solid/);
    expect(ruleBody(".ph-c-side-glow")).toMatch(/width:\s*520px/);
    expect(ruleBody(".ph-feat span")).toMatch(/width:\s*36px/);
  });

  it("keeps the boards' content-box icons, the glow only in dark", () => {
    const override = /\.ph-app-ic,\s*\.ph-app-ic-lg\s*\{([^}]*)\}/.exec(css);
    expect(override).not.toBeNull();
    expect(override![1]).toMatch(/box-sizing:\s*content-box/);
    expect(override![1]).toMatch(/box-shadow:\s*var\(--shadow-elevated\);/);
    expect(css).toMatch(
      /\.dark \.ph-app-ic,\s*\.dark \.ph-app-ic-lg\s*\{[^}]*box-shadow:\s*var\(--shadow-elevated\),\s*var\(--ph-glow\)/,
    );
  });

  it("states the board's 1440 sizes, then a fluid desktop from 768 that equals them at 1440", () => {
    const side = ruleBodies(".ph-c-side");
    const main = ruleBodies(".ph-c-main");
    const headline = ruleBodies(".ph-c-headline");
    expect(side[0]).toMatch(/padding:\s*0 96px/);
    expect(main[0]).toMatch(/width:\s*560px/);
    expect(main[0]).toMatch(/padding:\s*0 80px/);
    expect(headline[0]).toMatch(/font-size:\s*44px/);

    const sidePad = /padding:\s*0 (clamp\([^)]*\))/.exec(side.at(-1)!)![1];
    const mainWidth = /width:\s*(clamp\([^)]*\))/.exec(main.at(-1)!)![1];
    const mainPad = /padding:\s*0 (clamp\([^)]*\))/.exec(main.at(-1)!)![1];
    const size = /font-size:\s*(clamp\([^)]*\))/.exec(headline.at(-1)!)![1];
    expect(clampAt(sidePad, 1440)).toBeCloseTo(96, 0);
    expect(clampAt(mainWidth, 1440)).toBeCloseTo(560, 0);
    expect(clampAt(mainPad, 1440)).toBeCloseTo(80, 0);
    expect(clampAt(size, 1440)).toBeCloseTo(44, 0);
    // At 768 the main column and the side panel both keep room.
    expect(clampAt(mainWidth, 768)).toBe(400);
    expect(768 - clampAt(mainWidth, 768)).toBeGreaterThanOrEqual(320);
    const sideContent =
      768 - clampAt(mainWidth, 768) - 2 * clampAt(sidePad, 768);
    expect(sideContent).toBeGreaterThanOrEqual(240);
  });

  it("draws v2/SignIn's alert and terminal hint", () => {
    const alert = ruleBody(".ph-signin-alert");
    expect(alert).toMatch(/padding:\s*14px/);
    expect(alert).toMatch(/border-radius:\s*16px/);
    expect(alert).toMatch(/var\(--destructive\) 40%/);
    expect(alert).toMatch(/var\(--destructive\) 10%/);
    const hint = ruleBody(".ph-signin-hint");
    expect(hint).toMatch(/padding:\s*12px 14px/);
    expect(hint).toMatch(/border-radius:\s*14px/);
    expect(hint).toMatch(/background:\s*var\(--muted\)/);
  });

  it("keeps the landing's sign-in action stuck to the bottom, clear of the home indicator", () => {
    const cta = ruleBodies(".ph-landing-cta");
    expect(cta[0]).toMatch(/position:\s*sticky/);
    expect(cta[0]).toMatch(/bottom:\s*0/);
    expect(cta.at(-1)).toMatch(
      /padding-bottom:\s*calc\(28px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    expect(ruleBody(".ph-landing-cta-btn")).toMatch(/height:\s*54px/);
    expect(ruleBody(".ph-safe-bottom")).toMatch(
      /padding-bottom:\s*calc\(36px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
  });

  it("draws the CLI code, the device code input and the device warning", () => {
    const code = ruleBody(".ph-cli-code");
    expect(code).toMatch(/font-size:\s*24px/);
    expect(code).toMatch(/overflow-wrap:\s*anywhere/);
    const input = ruleBody(".ph-device-code");
    expect(input).toMatch(/height:\s*64px/);
    expect(input).toMatch(/letter-spacing:\s*0\.12em/);
    expect(ruleBody(".ph-device-note")).toMatch(/var\(--warning\) 12%/);
    expect(ruleBody(".ph-below-top")).toMatch(
      /min-height:\s*calc\(100dvh - var\(--cookie-notice-height, 0px\) - 56px\)/,
    );
  });

  it("gives the language + theme pair 44px boxes below md only", () => {
    const media = /@media \(max-width: 47\.99rem\)\s*\{([\s\S]*?)\n {2}\}/.exec(
      css,
    );
    expect(media).not.toBeNull();
    expect(media![1]).toMatch(
      /\.ph-pair \[role="radio"\]\s*\{\s*height:\s*44px/,
    );
    expect(media![1]).toMatch(
      /\.ph-pair > button\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
    );
    // Nothing outside that media rule styles the pair: md and up stays as today.
    const outside = css.replace(media![0], "");
    expect(outside).not.toMatch(/\.ph-pair\b/);
  });
});

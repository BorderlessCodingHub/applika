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

// v2/Today, v2/Pipeline, v2/QuickAdd, v2/Application, v2/Schedule and
// v2/Insights: each board's own classes, then what the app adds to them.
const CORE_BOARDS = [
  // shared by these boards
  "ph-ghost",
  "ph-input-soft",
  "ph-lbl-strong",
  "ph-kv",
  "ph-card-lg",
  "ph-h2-sm",
  "ph-sub",
  // v2/Today
  "ph-today",
  "ph-today-head",
  "ph-today-date",
  "ph-today-h1",
  "ph-hero",
  "ph-hero-eyebrow",
  "ph-hero-dot",
  "ph-hero-when",
  "ph-hero-title",
  "ph-hero-sub",
  "ph-hero-actions",
  "ph-hero-range",
  "ph-hero-cal",
  "ph-hero-open",
  "ph-stats",
  "ph-stats-num",
  "ph-stats-lbl",
  "ph-stats-go",
  "ph-sec-head",
  "ph-sec-count",
  "ph-sec-link",
  "ph-attn-list",
  "ph-attn-head",
  "ph-tile",
  "ph-attn-text",
  "ph-attn-company",
  "ph-attn-role",
  "ph-attn-quiet",
  "ph-attn-clock",
  "ph-attn-actions",
  "ph-caught-up",
  "ph-up-list",
  "ph-up-row",
  "ph-up-date",
  "ph-up-dow",
  "ph-up-day",
  "ph-up-text",
  "ph-up-title",
  "ph-up-sub",
  "ph-up-time",
  // v2/Pipeline
  "ph-pipe-head",
  "ph-pipe-bar",
  "ph-pipe-sub",
  "ph-pipe-pills",
  "ph-stage-pill",
  "ph-stage-pill-count",
  "ph-pipe-main",
  "ph-stage-h",
  "ph-stage-dot",
  "ph-stage-count",
  "ph-pipe-row",
  "ph-pipe-text",
  "ph-pipe-company",
  "ph-pipe-role",
  "ph-pipe-meta",
  "ph-pipe-ago",
  "ph-stale",
  "ph-stale-dot",
  "ph-outcome",
  "ph-show-more",
  // v2/QuickAdd
  "ph-qa-scrim",
  "ph-qa-sheet",
  "ph-qa-grab",
  "ph-qa-head",
  "ph-qa-title",
  "ph-qa-close",
  "ph-qa-lead",
  "ph-qa-form",
  "ph-qa-group",
  "ph-qa-group-lbl",
  "ph-qa-choices",
  "ph-choice",
  "ph-qa-more",
  "ph-qa-more-hint",
  "ph-qa-more-chev",
  "ph-qa-details",
  "ph-qa-salary",
  "ph-qa-foot",
  "ph-qa-cv",
  "ph-qa-cta",
  // v2/Application
  "ph-ap-more",
  "ph-ap-main",
  "ph-ap-tile",
  "ph-ap-h1",
  "ph-ap-role",
  "ph-ap-meta",
  "ph-ap-steps",
  "ph-ap-step",
  "ph-ap-step-bar",
  "ph-ap-step-label",
  "ph-ap-next",
  "ph-ap-next-eyebrow",
  "ph-ap-next-title",
  "ph-ap-next-when",
  "ph-ap-cal",
  "ph-kv-list",
  "ph-ap-link",
  "ph-ap-history-h",
  "ph-ap-history",
  "ph-ap-ev",
  "ph-ap-ev-rail",
  "ph-ap-ev-dot",
  "ph-ap-ev-line",
  "ph-ap-ev-body",
  "ph-ap-ev-title",
  "ph-ap-ev-when",
  "ph-ap-notes",
  "ph-ap-bar",
  "ph-ap-close",
  "ph-ap-log",
  // v2/Schedule (the Agenda)
  "ph-ag-top",
  "ph-ag-head",
  "ph-ag-month-row",
  "ph-ag-month",
  "ph-ag-nav",
  "ph-ag-week",
  "ph-ag-day",
  "ph-ag-dow",
  "ph-ag-num",
  "ph-ag-dot",
  "ph-ag-main",
  "ph-ag-gh",
  "ph-ag-list",
  "ph-ag-ev",
  "ph-ag-when-col",
  "ph-ag-time",
  "ph-ag-end",
  "ph-ag-line",
  "ph-ag-card",
  "ph-ag-card-head",
  "ph-ag-pill-dot",
  "ph-ag-when",
  "ph-ag-h3",
  "ph-ag-sub",
  "ph-ag-notes",
  "ph-ag-actions",
  "ph-ag-icon",
  "ph-ag-open",
  "ph-ag-empty",
  // v2/Insights
  "ph-ins",
  "ph-ins-head",
  "ph-ins-cycle",
  "ph-ins-hero",
  "ph-ins-label",
  "ph-ins-rate",
  "ph-ins-meter",
  "ph-ins-meter-fill",
  "ph-ins-dl",
  "ph-ins-stat",
  "ph-ins-stat-label",
  "ph-ins-stat-value",
  "ph-ins-funnel",
  "ph-ins-fn-head",
  "ph-ins-fn-label",
  "ph-ins-fn-n",
  "ph-ins-fn-pct",
  "ph-ins-track",
  "ph-ins-fill",
  "ph-ins-week-head",
  "ph-ins-weeks",
  "ph-ins-week",
  "ph-ins-week-v",
  "ph-ins-week-bar",
  "ph-ins-days",
  "ph-ins-day",
  "ph-ins-day-label",
  "ph-ins-day-value",
  "ph-ins-mode",
  "ph-ins-mode-a",
  "ph-ins-mode-p",
  "ph-ins-legend",
  "ph-ins-key",
  "ph-ins-swatch",
  "ph-ins-key-n",
] as const;

const CORE_ADAPTATIONS = [
  "ph-pipe-top",
  "ph-pipe-search",
  "ph-today-greet",
  "ph-hero-btns",
  "ph-qa-error",
  "ph-input-soft-host",
  "ph-ap-head",
  "ph-ap-readonly",
  "ph-ap-tile-row",
  "ph-ap-danger",
  "ph-ag-allday",
  "ph-ins-archived",
  "ph-ins-empty",
  "ph-ins-cycle-name",
] as const;

describe("phone.css: Today, Pipeline, QuickAdd, Application, Schedule, Insights", () => {
  it.each([...CORE_BOARDS, ...CORE_ADAPTATIONS])("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("draws v2/Today's hero, ghost buttons and Coming up rows at the board's sizes", () => {
    const hero = ruleBody(".ph-hero");
    expect(hero).toMatch(/padding:\s*20px/);
    expect(hero).toMatch(/border-radius:\s*24px/);
    expect(hero).toMatch(/160deg/);
    expect(hero).toMatch(/var\(--primary\) 16%/);
    expect(hero).toMatch(/var\(--primary\) 35%/);
    expect(ruleBody(".ph-hero-cal")).toMatch(/width:\s*44px/);
    expect(ruleBody(".ph-hero-cal")).toMatch(/border-radius:\s*14px/);
    const ghost = ruleBody(".ph-ghost");
    expect(ghost).toMatch(/height:\s*40px/);
    expect(ghost).toMatch(/padding:\s*0 14px/);
    expect(ghost).toMatch(/border-radius:\s*12px/);
    expect(ruleBody(".ph-up-row")).toMatch(/min-height:\s*64px/);
  });

  it("draws v2/Pipeline's pills, rows and Show more at the board's sizes", () => {
    const pill = ruleBody(".ph-stage-pill");
    expect(pill).toMatch(/height:\s*40px/);
    expect(pill).toMatch(/border-radius:\s*999px/);
    expect(ruleBody(".ph-pipe-row")).toMatch(/min-height:\s*68px/);
    expect(ruleBody(".ph-show-more")).toMatch(/min-height:\s*48px/);
    // The 40px pill and ghost button get a 44px box, the shape drawn inside it.
    expect(css).toMatch(
      /\.ph-ghost,\s*\.ph-stage-pill\s*\{[^}]*height:\s*44px/,
    );
  });

  it("truncates a long company, role or name instead of breaking the row", () => {
    for (const name of [".ph-pipe-company", ".ph-pipe-role"]) {
      expect(ruleBody(name), name).toMatch(/text-overflow:\s*ellipsis/);
    }
    expect(css).toMatch(
      /\.ph-attn-company,\s*\.ph-attn-role,\s*\.ph-hero-sub,\s*\.ph-up-title,\s*\.ph-up-sub,[^{]*\{[^}]*text-overflow:\s*ellipsis/,
    );
    expect(ruleBody(".ph-today-head .ph-today-h1")).toMatch(
      /-webkit-line-clamp:\s*2/,
    );
    expect(ruleBody(".ph-ins-cycle-name")).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("draws v2/QuickAdd's fields, chips and CTA at the board's sizes", () => {
    const input = ruleBody(".ph-input-soft");
    expect(input).toMatch(/height:\s*52px/);
    expect(input).toMatch(/border-radius:\s*14px/);
    expect(ruleBody(".ph-choice")).toMatch(/height:\s*44px/);
    const cta = ruleBody(".ph-qa-cta");
    expect(cta).toMatch(/height:\s*56px/);
    expect(cta).toMatch(/border-radius:\s*16px/);
  });

  it("keeps the Application bar fixed over the bottom inset, and the headers sticky under it", () => {
    const bar = ruleBody("div.ph-ap-bar");
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/z-index:\s*40/);
    expect(bar).toMatch(/env\(safe-area-inset-bottom, 0px\)/);
    for (const head of [".ph-top.ph-ap-head", "div.ph-ag-top"]) {
      const body = ruleBody(head);
      expect(body, head).toMatch(/position:\s*sticky/);
      expect(body, head).toMatch(/z-index:\s*30/);
    }
    expect(ruleBody(".ph-kv")).toMatch(/min-height:\s*52px/);
    // The boards' rows are content-box (52px and 44px plus their border).
    expect(css).toMatch(
      /\.ph-kv-list > \.ph-kv,\s*\.ph-ins-days > \.ph-ins-day\s*\{[^}]*box-sizing:\s*content-box/,
    );
  });

  it("draws v2/Schedule's week strip and card actions at the board's sizes", () => {
    const day = ruleBody(".ph-ag-day");
    expect(day).toMatch(/height:\s*68px/);
    expect(day).toMatch(/border-radius:\s*16px/);
    const icon = ruleBody(".ph-ag-icon");
    expect(icon).toMatch(/width:\s*44px/);
    expect(icon).toMatch(/height:\s*44px/);
  });

  it("draws v2/Insights' rate, weekly bars and day rows at the board's sizes", () => {
    expect(ruleBody(".ph-ins-rate")).toMatch(/font-size:\s*52px/);
    expect(ruleBody(".ph-ins-week-bar")).toMatch(/border-radius:\s*6px/);
    expect(ruleBody(".ph-ins-week:last-child .ph-ins-week-bar")).toMatch(
      /background:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-ins-day")).toMatch(/min-height:\s*44px/);
  });
});

// v2/Profile, v2/Devices, v2/Cycles, v2/Reports, v2/ReportDay, v2/Admin and
// their shared sheet: every board-only class (or the app's adaptation of it).
const ACCOUNT_AREA_BOARDS = [
  // v2/Profile
  "ph-pf",
  "ph-pf-edit",
  "ph-pf-seg",
  "ph-pf-head",
  "ph-pf-avatar",
  "ph-pf-who",
  "ph-pf-name",
  "ph-pf-role",
  "ph-pf-pills",
  "ph-pf-bio",
  "ph-pf-wrap",
  "ph-pf-link",
  "ph-pf-tags",
  "ph-pf-badges-head",
  "ph-pf-count",
  "ph-badges",
  "ph-badge",
  "ph-b",
  "ph-off",
  "ph-badge-name",
  "ph-pf-card",
  "ph-pf-card-h",
  "ph-pf-delete",
  "ph-pf-delete-panel",
  "ph-pf-delete-warning",
  "ph-pf-delete-list",
  "ph-pf-phrase",
  "ph-pf-actions",
  // v2/Devices
  "ph-dv-section",
  "ph-dv-lead",
  "ph-dv-list",
  "ph-dv-card",
  "ph-dv-head",
  "ph-dv-ic",
  "ph-dv-who",
  "ph-dv-title",
  "ph-dv-name",
  "ph-dv-here",
  "ph-dv-method",
  "ph-dv-dl",
  "ph-dv-none",
  "ph-dv-ended",
  "ph-dv-ended-name",
  "ph-dv-sub",
  // v2/Cycles
  "ph-cy",
  "ph-cy-current",
  "ph-cy-current-head",
  "ph-cy-eyebrow",
  "ph-cy-name",
  "ph-cy-stats",
  "ph-cy-list",
  "ph-cy-card",
  "ph-cy-card-main",
  "ph-cy-title",
  "ph-cy-sub",
  "ph-cy-empty",
  "ph-cy-trash",
  // v2/Reports
  "ph-rp",
  "ph-rp-sections",
  "ph-rp-accent",
  "ph-rp-lead",
  "ph-rp-progress",
  "ph-rp-tip",
  "ph-rp-current",
  "ph-rp-current-head",
  "ph-rp-day",
  "ph-rp-meta",
  "ph-rp-row-title",
  "ph-rp-sub",
  "ph-rp-future",
  "ph-rp-na",
  "ph-rp-closed",
  "ph-rp-lock",
  "ph-rp-closed-h1",
  "ph-rp-closed-hint",
  "ph-rp-closed-actions",
  // v2/ReportDay
  "ph-rd",
  "ph-rd-readonly",
  "ph-rd-h1",
  "ph-rd-auto-hint",
  "ph-dd-num",
  "ph-rd-offers",
  "ph-rd-section",
  "ph-rd-grid3",
  "ph-rd-count",
  "ph-rd-totals-h",
  "ph-rd-goal-lbl",
  "ph-rd-status",
  "ph-rd-cancel",
  "ph-rd-submit",
  "ph-input-host",
  // v2/Admin
  "ph-ad-top",
  "ph-ad-head",
  "ph-ad-chips",
  "ph-ad-body",
  "ph-ad-list",
  "ph-ad-list-cards",
  "ph-ad-cards",
  "ph-ad-other",
  "ph-ad-card-head",
  "ph-ad-card-h",
  "ph-ad-card-note",
  "ph-ad-bars",
  "ph-ad-bar-col",
  "ph-ad-bar",
  "ph-ad-bar-v",
  "ph-ad-bar-m",
  "ph-ad-top-h",
  "ph-ad-top-list",
  "ph-ad-top-row",
  "ph-ad-top-label",
  "ph-ad-top-v",
  "ph-ad-none",
  "ph-ad-src",
  "ph-ad-src-head",
  "ph-ad-src-name",
  "ph-ad-src-pending",
  "ph-ad-src-dl",
  "ph-ad-src-strong",
  "ph-ad-src-error",
  "ph-notice",
  "ph-notice-ic",
  "ph-notice-close",
  "ph-ad-hook",
  "ph-ad-hook-head",
  "ph-ad-hook-label",
  "ph-ad-hook-badges",
  "ph-ad-hook-none",
  "ph-ad-hook-url",
  "ph-ad-hook-actions",
  // the confirm and new-cycle sheets, shared
  "ph-sheet-stack",
  "ph-sheet-stack-form",
  "ph-sheet-actions",
  "ph-strong",
  "ph-focus-target",
] as const;

describe("phone.css: Profile, Devices, Cycles, Reports, ReportDay, Admin", () => {
  it.each(ACCOUNT_AREA_BOARDS)("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("draws v2/Profile's avatar, bio, badges and delete section at the board's sizes", () => {
    const avatar = ruleBody(".ph-pf-avatar");
    expect(avatar).toMatch(/width:\s*64px/);
    expect(avatar).toMatch(/height:\s*64px/);
    expect(avatar).toMatch(/font-size:\s*22px/);
    expect(avatar).toMatch(/font-weight:\s*700/);
    const bio = ruleBody(".ph-pf-bio");
    expect(bio).toMatch(/font-size:\s*15px/);
    expect(bio).toMatch(/line-height:\s*1\.55/);
    expect(ruleBody(".ph-badges")).toMatch(
      /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    const badge = ruleBody(".ph-badge");
    expect(badge).toMatch(/padding:\s*12px 8px/);
    expect(badge).toMatch(/border-radius:\s*16px/);
    const icon = ruleBody(".ph-badge .ph-b");
    expect(icon).toMatch(/width:\s*36px/);
    expect(icon).toMatch(/border-radius:\s*12px/);
    expect(ruleBody(".ph-badge.ph-off")).toMatch(/opacity:\s*0\.45/);
    expect(ruleBody(".ph-pf-delete")).toMatch(
      /border:\s*1px solid color-mix\(in oklab, var\(--destructive\) 35%, transparent\)/,
    );
    // The LinkedIn link keeps its line and gets a 44px box.
    expect(ruleBody(".ph-pf-link")).toMatch(/min-height:\s*44px/);
  });

  it("draws v2/Devices' icon tile, details and ended rows at the board's sizes", () => {
    const icon = ruleBody(".ph-dv-ic");
    expect(icon).toMatch(/width:\s*40px/);
    expect(icon).toMatch(/border-radius:\s*12px/);
    expect(icon).toMatch(/background:\s*var\(--muted\)/);
    const dl = ruleBody(".ph-dv-dl");
    expect(dl).toMatch(/grid-template-columns:\s*auto 1fr/);
    expect(dl).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-row.ph-dv-ended")).toMatch(/min-height:\s*64px/);
  });

  it("draws v2/Cycles' current card, the trash and the sheets at the board's sizes", () => {
    const name = ruleBody(".ph-cy-name");
    expect(name).toMatch(/font-size:\s*20px/);
    expect(name).toMatch(/font-weight:\s*700/);
    expect(ruleBody(".ph-cy-stats")).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-iconbtn.ph-cy-trash")).toMatch(
      /color:\s*var\(--destructive-text\)/,
    );
    expect(css).toMatch(
      /\.ph-sheet\.ph-sheet-stack,\s*\.ph-sheet-stack-form\s*\{[^}]*gap:\s*14px/,
    );
  });

  it("draws v2/Reports' progress, tip, current card and closed layout at the board's sizes", () => {
    const progress = ruleBody(".ph-rp-progress");
    expect(progress).toMatch(/height:\s*8px/);
    expect(ruleBody(".ph-rp-progress > span")).toMatch(
      /background:\s*var\(--primary\)/,
    );
    const tip = ruleBody(".ph-rp-tip");
    expect(tip).toMatch(/padding:\s*12px 14px/);
    expect(tip).toMatch(/border-radius:\s*14px/);
    expect(tip).toMatch(/background:\s*var\(--primary-muted\)/);
    expect(ruleBody(".ph-rp-current")).toMatch(
      /border:\s*1px solid var\(--primary\)/,
    );
    const lock = ruleBody(".ph-rp-lock");
    expect(lock).toMatch(/width:\s*56px/);
    expect(lock).toMatch(/border-radius:\s*18px/);
    expect(ruleBody(".ph-h1.ph-rp-closed-h1")).toMatch(/font-size:\s*26px/);
  });

  it("draws v2/ReportDay's numbers, grid and number fields at the board's sizes", () => {
    expect(ruleBody(".ph-dl dd.ph-dd-num")).toMatch(/font-size:\s*22px/);
    expect(ruleBody(".ph-dl dd.ph-rd-offers")).toMatch(
      /color:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-rd-grid3")).toMatch(
      /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(ruleBody('.ph-input[type="number"]')).toMatch(
      /appearance:\s*textfield/,
    );
    // The form clears the fixed bar; read-only has no bar.
    expect(ruleBody(".ph-rd")).toMatch(/calc\(120px \+ env/);
    expect(ruleBody(".ph-rd.ph-rd-readonly")).toMatch(/calc\(40px \+ env/);
  });

  it("draws v2/Admin's chips, bars, rows and cards at the board's sizes", () => {
    // The board's 2px top is 4px: the chips' 44px boxes overhang the row.
    expect(ruleBody(".ph-hs.ph-ad-chips")).toMatch(/padding:\s*4px 20px/);
    expect(ruleBody(".ph-ad-bars")).toMatch(/height:\s*110px/);
    expect(ruleBody(".ph-ad-bar")).toMatch(/border-radius:\s*6px 6px 2px 2px/);
    expect(ruleBody(".ph-ad-bar-col:last-child .ph-ad-bar")).toMatch(
      /background:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-ad-top-row")).toMatch(/min-height:\s*40px/);
    const sources = ruleBody(".ph-ad-src-dl");
    expect(sources).toMatch(
      /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(sources).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-ad-hook-url")).toMatch(/font-size:\s*12px/);
  });
});

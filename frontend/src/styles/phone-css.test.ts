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

const JOBS_CVS_DRAFT_BOARDS = [
  // the boards' own classes (Jobs, JobDetail, Draft, CVEditor)
  "ph-fit",
  "ph-strong",
  "ph-partial",
  "ph-low",
  "ph-kw",
  "ph-m",
  "ph-x",
  "ph-step",
  "ph-n",
  "ph-sec-row",
  "ph-acc",
  "ph-chev",
  // v2/Jobs
  "ph-jb",
  "ph-jb-head",
  "ph-jb-search",
  "ph-jb-search-box",
  "ph-jb-search-ic",
  "ph-jb-search-input",
  "ph-jb-chips",
  "ph-jb-chip-text",
  "ph-jb-body",
  "ph-jb-results",
  "ph-jb-list",
  "ph-jb-card",
  "ph-jb-link",
  "ph-jb-top",
  "ph-jb-who",
  "ph-jb-title",
  "ph-jb-sub",
  "ph-jb-tags",
  "ph-jb-tag-li",
  "ph-jb-tag",
  "ph-jb-more-tags",
  "ph-jb-foot",
  "ph-jb-posted",
  "ph-jb-dismissed",
  "ph-jb-dismiss",
  "ph-jb-status",
  "ph-jb-note",
  "ph-jb-more",
  "ph-jb-state",
  "ph-jb-empty",
  "ph-jb-state-h",
  "ph-jb-options",
  "ph-jb-check",
  "ph-jb-chipset",
  "ph-jb-tag-picked",
  "ph-jb-tag-text",
  "ph-jb-tag-x",
  "ph-jb-toggle",
  "ph-jb-saved",
  // v2/JobDetail
  "ph-jd",
  "ph-jd-nobar",
  "ph-jd-meta",
  "ph-jd-h1",
  "ph-jd-tags",
  "ph-jd-marks",
  "ph-jd-note",
  "ph-jd-hint",
  "ph-jd-gap",
  "ph-jd-tabs",
  "ph-jd-card",
  "ph-jd-ring",
  "ph-jd-score",
  "ph-jd-pct",
  "ph-jd-band",
  "ph-jd-kw-lbl",
  "ph-jd-kws",
  "ph-jd-desc",
  "ph-jd-source",
  "ph-jd-dismiss",
  "ph-jd-start",
  "ph-jd-empty",
  "ph-jd-empty-ic",
  "ph-jd-empty-h",
  // v2/StartApplication
  "ph-sa-head",
  "ph-sa-title",
  "ph-sa-close",
  "ph-sheet-body",
  "ph-sa-fieldset",
  "ph-sa-legend",
  "ph-sa-hint",
  "ph-sa-none",
  "ph-sa-error-card",
  "ph-sa-alert",
  "ph-sheet-foot",
  "ph-sa-conflict",
  "ph-sa-conflict-h",
  // v2/Draft
  "ph-dr",
  "ph-dr-nobar",
  "ph-dr-h1",
  "ph-dr-status",
  "ph-dr-ok",
  "ph-dr-bad",
  "ph-dr-warn",
  "ph-dr-steps",
  "ph-step-text",
  "ph-step-t",
  "ph-step-s",
  "ph-dr-fields",
  "ph-dr-pair",
  "ph-dr-tri",
  "ph-dr-amount",
  "ph-dr-sym",
  "ph-dr-amount-input",
  "ph-dr-error",
  "ph-dr-cv",
  "ph-dr-tailor",
  "ph-dr-tailor-text",
  "ph-dr-tailor-t",
  "ph-dr-tailor-s",
  "ph-dr-copied",
  "ph-dr-copied-text",
  "ph-dr-sec-name",
  "ph-dr-sec-meta",
  "ph-dr-edit-head",
  "ph-dr-message",
  "ph-dr-message-ic",
  "ph-dr-message-h",
  "ph-dr-alert",
  "ph-dr-bar",
  "ph-dr-lead-btn",
  "ph-dr-go-btn",
  "ph-dr-note",
  "ph-dr-note-bad",
  // v2/CVs
  "ph-cv",
  "ph-cv-body",
  "ph-cv-list",
  "ph-cv-card",
  "ph-cv-head",
  "ph-cv-thumb",
  "ph-cv-who",
  "ph-cv-name",
  "ph-cv-headline",
  "ph-cv-updated",
  "ph-cv-tags",
  "ph-cv-tag",
  "ph-cv-counts",
  "ph-cv-actions",
  "ph-cv-new",
  "ph-cv-new-ic",
  "ph-cv-new-t",
  "ph-cv-new-s",
  "ph-cv-limit",
  "ph-cv-empty",
  // v2/CVEditor
  "ph-ce",
  "ph-ce-nobar",
  "ph-ce-h1",
  "ph-ce-message",
  "ph-ce-message-h",
  "ph-ce-list",
  "ph-acc-h",
  "ph-acc-text",
  "ph-acc-t",
  "ph-acc-m",
  "ph-acc-bad",
  "ph-ce-status",
  "ph-ce-panel",
] as const;

describe("phone.css: Jobs, JobDetail, StartApplication, Draft, CVs, CVEditor", () => {
  it.each(JOBS_CVS_DRAFT_BOARDS)("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("draws v2/Jobs' fit pill, search, card and footer at the board's sizes", () => {
    const fit = ruleBody(".ph-fit");
    expect(fit).toMatch(/height:\s*26px/);
    expect(fit).toMatch(/border-radius:\s*999px/);
    expect(fit).toMatch(/font-size:\s*12px/);
    expect(fit).toMatch(/font-weight:\s*600/);
    expect(ruleBody(".ph-fit.ph-strong")).toMatch(
      /background:\s*color-mix\(in oklab, var\(--success\) 16%, transparent\)/,
    );
    expect(ruleBody(".ph-fit.ph-partial")).toMatch(
      /background:\s*color-mix\(in oklab, var\(--warning\) 16%, transparent\)/,
    );
    expect(ruleBody(".ph-fit.ph-low")).toMatch(/background:\s*var\(--muted\)/);
    expect(ruleBody(".ph-input.ph-jb-search-input")).toMatch(
      /padding-left:\s*44px/,
    );
    const icon = ruleBody(".ph-jb-search-ic");
    expect(icon).toMatch(/left:\s*16px/);
    expect(icon).toMatch(/top:\s*17px/);
    expect(ruleBody(".ph-app .ph-jb-link")).toMatch(
      /padding:\s*16px 16px 12px/,
    );
    const title = ruleBody(".ph-jb-title");
    expect(title).toMatch(/font-size:\s*16px/);
    expect(title).toMatch(/font-weight:\s*600/);
    expect(title).toMatch(/line-height:\s*1\.3/);
    expect(ruleBody(".ph-jb-posted")).toMatch(/font-size:\s*13px/);
    // Dismiss keeps its text look inside a 44px box.
    expect(ruleBody(".ph-jb-dismiss")).toMatch(/min-height:\s*44px/);
    // The chips' 44px boxes overhang the row: 4px, not the board's 2px.
    expect(ruleBody(".ph-hs.ph-jb-chips")).toMatch(/padding:\s*4px 20px/);
  });

  it("draws v2/JobDetail's keywords, h1, score and description at the board's sizes", () => {
    const keyword = ruleBody(".ph-kw");
    expect(keyword).toMatch(/height:\s*26px/);
    expect(keyword).toMatch(/border-radius:\s*8px/);
    expect(keyword).toMatch(/font-size:\s*13px/);
    expect(keyword).toMatch(/font-weight:\s*500/);
    expect(ruleBody(".ph-kw.ph-m")).toMatch(
      /background:\s*color-mix\(in oklab, var\(--success\) 16%, transparent\)/,
    );
    expect(ruleBody(".ph-kw.ph-x")).toMatch(
      /border:\s*1px dashed var\(--border-strong\)/,
    );
    expect(ruleBody(".ph-h1.ph-jd-h1")).toMatch(/font-size:\s*26px/);
    const pct = ruleBody(".ph-jd-pct");
    expect(pct).toMatch(/font-size:\s*26px/);
    expect(pct).toMatch(/font-weight:\s*700/);
    const description = ruleBody(".ph-jd-desc");
    expect(description).toMatch(/font-size:\s*15px/);
    expect(description).toMatch(/line-height:\s*1\.6/);
    // One CV's panel shows at a time; the others stay in the DOM for their headings.
    expect(ruleBody('.ph-jd-card[data-state="inactive"]')).toMatch(
      /display:\s*none/,
    );
    expect(ruleBody(".ph-jd")).toMatch(/calc\(120px \+ env/);
  });

  it("draws v2/StartApplication's title and close at the board's sizes", () => {
    const title = ruleBody(".ph-sa-title");
    expect(title).toMatch(/font-size:\s*22px/);
    expect(title).toMatch(/font-weight:\s*700/);
    const close = ruleBody(".ph-sa-close");
    expect(close).toMatch(/width:\s*44px/);
    expect(close).toMatch(/height:\s*44px/);
  });

  it("draws v2/Draft's steps nav, step, number and section rows at the board's sizes", () => {
    const steps = ruleBody(".ph-dr-steps");
    expect(steps).toMatch(/padding:\s*4px/);
    expect(steps).toMatch(/border-radius:\s*18px/);
    expect(steps).toMatch(/background:\s*var\(--muted\)/);
    const step = ruleBody(".ph-step");
    expect(step).toMatch(/padding:\s*10px 12px/);
    expect(step).toMatch(/border-radius:\s*14px/);
    const number = ruleBody(".ph-step .ph-n");
    expect(number).toMatch(/width:\s*26px/);
    expect(number).toMatch(/height:\s*26px/);
    expect(number).toMatch(/border:\s*2px solid var\(--border-strong\)/);
    expect(ruleBody(".ph-step.ph-on")).toMatch(
      /background:\s*var\(--surface\)/,
    );
    expect(ruleBody(".ph-step.ph-on .ph-n")).toMatch(
      /background:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-sec-row")).toMatch(/min-height:\s*52px/);
    expect(css).toMatch(
      /\.ph-h1\.ph-dr-h1,\s*\.ph-h1\.ph-ce-h1\s*\{\s*font-size:\s*26px/,
    );
    // The bar holds a note while one shows: the content clears it.
    expect(ruleBody(".ph-dr")).toMatch(/calc\(120px \+ env/);
    expect(ruleBody(".ph-dr[data-noted]")).toMatch(/calc\(160px \+ env/);
  });

  it("draws v2/CVs' thumb, counts and new-CV tile at the board's sizes", () => {
    const thumb = ruleBody(".ph-cv-thumb");
    expect(thumb).toMatch(/width:\s*44px/);
    expect(thumb).toMatch(/height:\s*52px/);
    expect(thumb).toMatch(/border-radius:\s*8px/);
    expect(ruleBody(".ph-cv-counts")).toMatch(/font-size:\s*12px/);
    const tile = ruleBody(".ph-app .ph-cv-new");
    expect(tile).toMatch(/min-height:\s*120px/);
    expect(tile).toMatch(/border-radius:\s*20px/);
    expect(tile).toMatch(/border:\s*2px dashed var\(--border-strong\)/);
  });

  it("draws v2/CVEditor's rows and turns the chevron in .15s, off under reduced motion", () => {
    const row = ruleBody(".ph-acc");
    expect(row).toMatch(/min-height:\s*60px/);
    expect(row).toMatch(/padding:\s*0 16px/);
    expect(ruleBody(".ph-acc .ph-chev")).toMatch(
      /transition:\s*transform 0\.15s/,
    );
    expect(ruleBody('.ph-acc[aria-expanded="true"] .ph-chev')).toMatch(
      /transform:\s*rotate\(180deg\)/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ph-acc \.ph-chev\s*\{\s*transition:\s*none;/,
    );
  });
});

// v3 (PRD 0022): the boards' shared modifiers, the pages control, and the
// AdminUsers (ph-au-) and AdminCompanies / AdminPlatforms (ph-cat-) inline
// style blocks made classes.
const V3_SHARED = [
  "ph-h1-26",
  "ph-flat",
  "ph-dl-bg",
  "ph-dl-4",
  "ph-dl-3s",
  "ph-miss",
  "ph-box",
  "ph-pick",
  "ph-req",
  "ph-pager",
  "ph-pager-n",
] as const;

const V3_ADMIN_USERS = [
  "ph-au-search",
  "ph-au-search-ic",
  "ph-au-search-input",
  "ph-au-bar",
  "ph-au-count",
  "ph-au-sort-by",
  "ph-au-sort",
  "ph-au-arrow",
  "ph-au-list",
  "ph-au-row",
  "ph-au-head",
  "ph-au-ini",
  "ph-au-who",
  "ph-au-name-row",
  "ph-au-name",
  "ph-au-email",
  "ph-au-joined",
  "ph-au-foot",
  "ph-au-counts",
  "ph-au-shield",
  "ph-au-sheet-head",
  "ph-au-sheet-h",
  "ph-au-sheet-body",
  "ph-au-span",
  "ph-au-bio",
  "ph-au-stack",
  "ph-au-dl",
] as const;

const V3_ADMIN_CATALOG = [
  "ph-cat-search",
  "ph-cat-search-ic",
  "ph-cat-search-input",
  "ph-cat-seg",
  "ph-cat-bar",
  "ph-cat-count",
  "ph-cat-list",
  "ph-cat-row",
  "ph-cat-head",
  "ph-cat-title",
  "ph-cat-name",
  "ph-cat-url",
  "ph-cat-url-in",
  "ph-cat-url-text",
  "ph-cat-url-ic",
  "ph-cat-nourl",
  "ph-cat-meta",
  "ph-cat-actions",
  "ph-cat-edit",
  "ph-cat-sheet-h",
  "ph-cat-form",
  "ph-cat-confirm",
  "ph-cat-text",
  "ph-cat-muted",
  "ph-cat-undone",
  "ph-cat-sheet-actions",
  "ph-cat-approve-url",
] as const;

describe("phone.css: v3 shared parts, AdminUsers, AdminCompanies, AdminPlatforms", () => {
  it.each([...V3_SHARED, ...V3_ADMIN_USERS, ...V3_ADMIN_CATALOG])(
    "declares .%s",
    (name) => {
      expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
    },
  );

  it("draws the boards' shared modifiers at their sizes", () => {
    expect(ruleBody(".ph-h1.ph-h1-26")).toMatch(/font-size:\s*26px/);
    const flat = ruleBody(".ph-iconbtn.ph-flat");
    expect(flat).toMatch(/box-shadow:\s*none/);
    expect(flat).toMatch(/background:\s*var\(--muted\)/);
    expect(ruleBody(".ph-dl.ph-dl-bg > div")).toMatch(
      /background:\s*var\(--background\)/,
    );
    expect(ruleBody(".ph-dl.ph-dl-4")).toMatch(
      /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    );
    const three = ruleBody(".ph-dl.ph-dl-3s");
    expect(three).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(three).toMatch(/gap:\s*8px/);
    expect(three).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-dl.ph-dl-3s dt")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    const threeValue = ruleBody(".ph-dl.ph-dl-3s dd");
    expect(threeValue).toMatch(/margin:\s*2px 0 0/);
    expect(threeValue).toMatch(/font-weight:\s*600/);
    const miss = ruleBody(".ph-tag.ph-miss");
    expect(miss).toMatch(/background:\s*transparent/);
    expect(miss).toMatch(
      /box-shadow:\s*inset 0 0 0 1px var\(--border-strong\)/,
    );
    expect(miss).toMatch(/color:\s*var\(--muted-foreground\)/);
    const box = ruleBody(".ph-box");
    expect(box).toMatch(/width:\s*20px/);
    expect(box).toMatch(/height:\s*20px/);
    expect(box).toMatch(/border-radius:\s*6px/);
    expect(box).toMatch(/border:\s*2px solid var\(--border-strong\)/);
    expect(ruleBody('.ph-opt[aria-checked="true"]')).toMatch(
      /background:\s*var\(--primary-muted\)/,
    );
    expect(ruleBody('.ph-opt[aria-checked="true"] .ph-box')).toMatch(
      /background:\s*var\(--primary\)/,
    );
    const pick = ruleBody(".ph-pick");
    expect(pick).toMatch(/padding:\s*14px 16px/);
    expect(pick).toMatch(/border-radius:\s*20px/);
    expect(ruleBody(".ph-pick.ph-on")).toMatch(
      /border-color:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-req")).toMatch(/color:\s*var\(--destructive-text\)/);
    const pager = ruleBody(".ph-pager");
    expect(pager).toMatch(/justify-content:\s*space-between/);
    expect(pager).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-pager-n")).toMatch(/font-size:\s*13px/);
  });

  it("dims an unavailable button to .45, and leaves a pending one its 0021 look", () => {
    // The boards' [disabled], kept focusable through aria-disabled.
    const unavailable =
      /\.ph-btn\[aria-disabled="true"\]:not\(\[data-disabled\]\):not\(\[aria-busy="true"\]\),\s*\.ph-iconbtn\[aria-disabled="true"\]:not\(\[data-disabled\]\):not\(\s*\[aria-busy="true"\]\s*\)\s*\{([^}]*)\}/.exec(
        css,
      );
    expect(unavailable).not.toBeNull();
    expect(unavailable![1]).toMatch(/opacity:\s*0?\.45/);
    expect(unavailable![1]).toMatch(/cursor:\s*default/);
    expect(ruleBody(".ph-iconbtn[data-disabled]")).toMatch(/opacity:\s*0?\.6/);
    expect(ruleBody('.ph-iconbtn[aria-busy="true"]')).toMatch(
      /cursor:\s*progress/,
    );
  });

  it("draws v3/AdminUsers' search, sort row, rows and sheet at the board's sizes", () => {
    expect(ruleBody(".ph-au-search-ic")).toMatch(/left:\s*16px;\s*top:\s*17px/);
    expect(ruleBody(".ph-input.ph-au-search-input")).toMatch(
      /padding-left:\s*44px/,
    );
    const sort = ruleBody(".ph-hs.ph-au-sort");
    expect(sort).toMatch(/margin:\s*0 -20px/);
    expect(sort).toMatch(/padding:\s*4px 20px/);
    expect(sort).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-au-arrow")).toMatch(/font-size:\s*12px/);
    expect(ruleBody(".ph-au-list[data-refreshing]")).toMatch(
      /opacity:\s*0?\.6/,
    );
    const row = ruleBody(".ph-au-row");
    expect(row).toMatch(/padding:\s*14px 16px/);
    expect(row).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-au-head")).toMatch(/gap:\s*12px/);
    const initials = ruleBody(".ph-au-ini");
    expect(initials).toMatch(/width:\s*40px/);
    expect(initials).toMatch(/height:\s*40px/);
    expect(initials).toMatch(/background:\s*var\(--accent\)/);
    expect(initials).toMatch(/color:\s*var\(--accent-foreground\)/);
    expect(initials).toMatch(/font-size:\s*13px/);
    expect(initials).toMatch(/font-weight:\s*700/);
    expect(ruleBody(".ph-au-who")).toMatch(/min-width:\s*0/);
    const name = ruleBody(".ph-au-name");
    expect(name).toMatch(/font-size:\s*15px/);
    expect(name).toMatch(/font-weight:\s*600/);
    const email = ruleBody(".ph-au-email");
    expect(email).toMatch(/font-size:\s*13px/);
    expect(email).toMatch(/text-overflow:\s*ellipsis/);
    expect(email).toMatch(/white-space:\s*nowrap/);
    expect(ruleBody(".ph-au-joined")).toMatch(/flex:\s*none/);
    expect(ruleBody(".ph-au-foot")).toMatch(/gap:\s*8px/);
    const counts = ruleBody(".ph-au-counts");
    expect(counts).toMatch(/font-size:\s*12px/);
    expect(counts).toMatch(/flex:\s*1/);
    expect(ruleBody(".ph-iconbtn.ph-au-shield")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    expect(ruleBody('.ph-iconbtn.ph-au-shield[aria-pressed="true"]')).toMatch(
      /color:\s*var\(--primary\)/,
    );
    expect(ruleBody(".ph-au-sheet-head")).toMatch(/padding-bottom:\s*12px/);
    expect(ruleBody(".ph-au-sheet-body")).toMatch(/gap:\s*16px/);
    expect(ruleBody(".ph-au-span")).toMatch(/grid-column:\s*1 \/ -1/);
    const bio = ruleBody(".ph-au-bio");
    expect(bio).toMatch(/margin:\s*0 4px/);
    expect(bio).toMatch(/font-size:\s*15px/);
    expect(bio).toMatch(/line-height:\s*1\.5/);
    const stack = ruleBody(".ph-au-stack");
    expect(stack).toMatch(/flex-wrap:\s*wrap/);
    expect(stack).toMatch(/gap:\s*6px/);
  });

  it("ends a long username, sheet title, email or tag in an ellipsis (PRD 0022)", () => {
    expect(css).toMatch(
      /\.ph-au-name,\s*\.ph-h2\.ph-au-sheet-h\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
    expect(ruleBody(".ph-au-name-row > .ph-pill")).toMatch(/flex:\s*none/);
    expect(ruleBody(".ph-au-stack > .ph-tag")).toMatch(
      /text-overflow:\s*ellipsis/,
    );
  });

  it("draws v3/AdminCompanies and v3/AdminPlatforms' list, cards and sheets at the board's sizes", () => {
    expect(ruleBody(".ph-input.ph-cat-search-input")).toMatch(
      /padding-left:\s*44px/,
    );
    expect(ruleBody(".ph-seg.ph-cat-seg")).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(ruleBody(".ph-cat-count")).toMatch(/font-size:\s*13px/);
    const list = ruleBody(".ph-cat-list");
    expect(list).toMatch(/list-style:\s*none/);
    expect(list).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-cat-row")).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-cat-head")).toMatch(/gap:\s*10px/);
    const title = ruleBody(".ph-cat-title");
    expect(title).toMatch(/flex-wrap:\s*wrap/);
    expect(title).toMatch(/gap:\s*6px/);
    const names = ruleBodies(".ph-cat-name").join("");
    expect(names).toMatch(/font-size:\s*16px/);
    expect(names).toMatch(/font-weight:\s*600/);
    expect(names).toMatch(/text-overflow:\s*ellipsis/);
    expect(names).toMatch(/white-space:\s*nowrap/);
    const urlLine = ruleBodies(".ph-cat-url-in").join("");
    expect(urlLine).toMatch(/min-height:\s*28px/);
    expect(urlLine).toMatch(/font-size:\s*12px/);
    expect(urlLine).toMatch(/gap:\s*6px/);
    const url = ruleBody(".ph-hit.ph-cat-url");
    expect(url).toMatch(/margin-block:\s*-8px/);
    expect(url).toMatch(/color:\s*var\(--primary\)/);
    expect(ruleBody(".ph-cat-url-text")).toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleBody(".ph-cat-nourl")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    expect(ruleBody(".ph-cat-actions")).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-btn.ph-cat-edit")).toMatch(/flex:\s*1/);
    const sheetTitle = ruleBody(".ph-h2.ph-cat-sheet-h");
    expect(sheetTitle).toMatch(/padding:\s*4px 0 12px/);
    // A long unbroken name stays readable on an irreversible confirm.
    expect(sheetTitle).toMatch(/overflow-wrap:\s*anywhere/);
    expect(ruleBody(".ph-cat-form")).toMatch(/gap:\s*14px/);
    expect(ruleBody(".ph-cat-confirm")).toMatch(/gap:\s*10px/);
    const text = ruleBody(".ph-cat-text");
    expect(text).toMatch(/font-size:\s*15px/);
    expect(text).toMatch(/line-height:\s*1\.5/);
    expect(ruleBody(".ph-cat-text > .ph-cat-muted")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    expect(ruleBody(".ph-hint.ph-cat-undone")).toMatch(/font-size:\s*15px/);
    const actions = ruleBody(".ph-cat-sheet-actions");
    expect(actions).toMatch(/margin-top:\s*8px/);
    expect(actions).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-cat-sheet-actions > .ph-btn:first-child")).toMatch(
      /flex:\s*none/,
    );
    expect(ruleBody(".ph-cat-sheet-actions > .ph-btn:last-child")).toMatch(
      /flex:\s*1/,
    );
    expect(ruleBody(".ph-cat-approve-url")).toMatch(
      /text-overflow:\s*ellipsis/,
    );
    expect(ruleBody('.ph-cat-form .ph-input[aria-invalid="true"]')).toMatch(
      /border-color:\s*var\(--destructive-text\)/,
    );
    expect(ruleBody(".ph-cat-list[data-refreshing]")).toMatch(
      /opacity:\s*0?\.6/,
    );
  });
});

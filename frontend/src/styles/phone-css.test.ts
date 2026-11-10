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

/** One rule's declarations, whitespace folded: `{ property: value }`. */
function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    body
      .split(";")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

// Sign-in option C below md (C_Mobile) and option A at md and up
// (A_Desktop), v2/Landing, v2/CookiePolicy, v2/CliCode and v2/DeviceSignIn:
// each board's own <style> classes, the boards' inline style blocks made
// classes, and what the app adds to them.
const BOARD_ONLY = [
  "ph-c-glow",
  "ph-app-ic",
  "ph-c-badge",
  "ph-a-mesh",
  "ph-a-tile",
  "ph-doc",
  "ph-ck",
] as const;

const INLINE_BLOCKS = [
  "ph-a-main",
  "ph-a-card",
  "ph-a-tiles",
  "ph-a-link",
  "ph-a-dash",
  "ph-a-link-ic",
  "ph-a-h1",
  "ph-a-lead",
  "ph-a-cta",
  "ph-a-logo",
  "ph-a-foot",
  "ph-a-signup",
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
  "ph-landing-home",
  "ph-landing-actions",
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
    expect(ruleBody(".ph-c-badge img")).toMatch(/object-fit:\s*contain/);
    // The transparent mark on the tile's ground, no border.
    expect(css).toMatch(
      /\.ph-c-badge \{\s*padding: 8px;\s*box-sizing: border-box;\s*background: var\(--background\);\s*\}/,
    );
  });

  it("drops C_Desktop's classes: the side panel, its icon, badge, features, main and headline", () => {
    for (const gone of [
      "ph-c-side",
      "ph-c-side-glow",
      "ph-app-ic-lg",
      "ph-c-badge-lg",
      "ph-feat",
      "ph-c-main",
      "ph-c-headline",
    ]) {
      expect(DECLARED.has(gone), `.${gone} is still declared`).toBe(false);
    }
    expect(css).not.toMatch(/clamp\(/);
  });

  it("keeps the boards' content-box icons, the glow only in dark", () => {
    // The app's override sits after the board's rule, at the top level (not `.dark`).
    const override = /\n {2}\.ph-app-ic\s*\{([^}]*)\}/g;
    const bodies = [...css.matchAll(override)].map((m) => m[1]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatch(/box-sizing:\s*content-box/);
    expect(bodies[1]).toMatch(/box-shadow:\s*var\(--shadow-elevated\);/);
    expect(css).toMatch(
      /\.dark \.ph-app-ic\s*\{[^}]*box-shadow:\s*var\(--shadow-elevated\),\s*var\(--ph-glow\)/,
    );
  });

  // signin/A_Desktop, every class and inline style the board draws, as drawn.
  it.each([
    [
      ".ph-a-mesh",
      {
        position: "absolute",
        inset: "0",
        background:
          "radial-gradient( ellipse 80% 60% at 20% 30%, oklch(0.768 0.139 174.6 / 0.1) 0%, transparent 70% ), radial-gradient( ellipse 60% 80% at 80% 70%, oklch(0.506 0.156 295.7 / 0.08) 0%, transparent 70% )",
      },
    ],
    [
      ".ph-a-tile",
      {
        width: "72px",
        height: "72px",
        "border-radius": "20px",
        background: "var(--background)",
        border: "1px solid var(--border)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        overflow: "hidden",
        "box-sizing": "border-box",
      },
    ],
    [
      ".ph-a-tile img",
      {
        width: "100%",
        height: "100%",
        display: "block",
        padding: "14px",
        "box-sizing": "border-box",
        "object-fit": "contain",
      },
    ],
    [
      ".ph-a-main",
      {
        position: "relative",
        flex: "1",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
      },
    ],
    [
      ".ph-a-card",
      {
        width: "448px",
        padding: "40px",
        "box-sizing": "border-box",
        "border-radius": "24px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        "box-shadow": "var(--shadow-elevated)",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "text-align": "center",
      },
    ],
    [".ph-a-tiles", { display: "flex", "align-items": "center", gap: "12px" }],
    [".ph-a-link", { display: "flex", "align-items": "center", gap: "4px" }],
    [
      ".ph-a-dash",
      { width: "12px", "border-top": "2px dashed var(--border-strong)" },
    ],
    [
      ".ph-a-link-ic",
      {
        width: "30px",
        height: "30px",
        "border-radius": "999px",
        background: "var(--primary-muted)",
        color: "var(--primary)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
      },
    ],
    [
      ".ph-a-h1",
      {
        margin: "24px 0 0",
        "font-size": "26px",
        "font-weight": "700",
        "letter-spacing": "-0.02em",
      },
    ],
    [
      ".ph-a-lead",
      {
        margin: "8px 0 0",
        "font-size": "15px",
        "line-height": "1.5",
        color: "var(--muted-foreground)",
      },
    ],
    [
      ".ph-btn.ph-a-cta",
      {
        "margin-top": "28px",
        width: "100%",
        height: "48px",
        "border-radius": "12px",
      },
    ],
    [".ph-a-logo", { flex: "none", width: "18px", height: "18px" }],
    [".ph-a-logo.ph-c-logo", { width: "20px", height: "20px" }],
    [
      ".ph-btn.ph-bl",
      {
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        "font-weight": "500",
        gap: "12px",
      },
    ],
    [
      ".ph-a-foot",
      {
        margin: "0 -20px",
        "font-size": "14px",
        color: "var(--muted-foreground)",
        "white-space": "nowrap",
      },
    ],
    [
      ".ph-a-signup",
      {
        "font-weight": "600",
        color: "var(--foreground)",
        "text-decoration": "underline",
        "text-decoration-color": "var(--primary)",
        "text-underline-offset": "4px",
      },
    ],
  ] as const)("draws A_Desktop's %s as drawn", (selector, expected) => {
    // .ph-a-main also has the app's short-screen padding, after the board's rule.
    expect(ruleBodies(selector), selector).toHaveLength(
      selector === ".ph-a-main" ? 2 : 1,
    );
    expect(declarations(ruleBody(selector))).toEqual(expected);
  });

  it("keeps A's card clear of the pair on a short screen, centred as drawn", () => {
    const [board, app] = ruleBodies(".ph-a-main");
    expect(declarations(board)).not.toHaveProperty("padding-block");
    // Pair top 20 + its 36px + 20: symmetric, so the centre does not move.
    expect(declarations(app)).toEqual({ "padding-block": "76px" });
    expect(css.indexOf(app)).toBeGreaterThan(css.indexOf(board));
    // Only where the pair can stand over the card: below 2 x (448 / 2 + 166
    // + 24) = 828px. From there up, the board's centring holds.
    expect(css).toMatch(
      /@media \(max-width: 51\.74rem\)\s*\{\s*\.ph-a-main\s*\{\s*padding-block:\s*76px;\s*\}\s*\}/,
    );
  });

  it("reuses the shared .ph-dots and .ph-btn.ph-pri, equal to A_Desktop's .dots and .btn.pri", () => {
    expect(declarations(ruleBody(".ph-dots"))).toEqual({
      position: "absolute",
      inset: "0",
      opacity: "0.3",
      "background-image":
        "radial-gradient( circle, var(--border) 1px, transparent 1px )",
      "background-size": "24px 24px",
    });
    expect(declarations(ruleBody(".ph-btn"))).toMatchObject({
      height: "52px",
      padding: "0 20px",
      "font-size": "15px",
      "font-weight": "600",
      gap: "8px",
    });
    expect(declarations(ruleBody(".ph-btn.ph-pri"))).toEqual({
      background: "var(--primary)",
      color: "var(--primary-foreground)",
      "box-shadow": "var(--ph-glow)",
    });
    // .ph-mesh is v2/SignIn's (its second gradient differs): A has its own.
    expect(ruleBody(".ph-mesh")).toMatch(/oklch\(0\.648 0\.119 235 \/ 0\.06\)/);
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

  it("ends the landing and /cli footer clear of the home indicator, in one shared rule", () => {
    expect(ruleBodies(".ph-landing-footer")).toHaveLength(1);
    expect(declarations(ruleBody(".ph-landing-footer"))).toEqual({
      "margin-top": "40px",
      padding: "0 20px calc(48px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      gap: "20px",
      "font-size": "13px",
    });
    // One footer for both pages: no page variant of it, no scroll padding
    // (only the signed-in phone shell sets one, on the document).
    expect(css).not.toMatch(/\.ph-landing-footer\.[a-z]/);
    expect(ruleBody(".ph-landing-footer")).not.toMatch(/scroll-padding/);
    for (const [, selector] of css.matchAll(/([^{};]+)\{[^}]*scroll-padding/g))
      expect(selector).toMatch(/\.ph-shell\[data-/);
    expect(ruleBody(".ph-safe-bottom")).toMatch(
      /padding-bottom:\s*calc\(36px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
  });

  it("pads the document's scroll under the signed-in shell's chrome (WCAG 2.4.11)", () => {
    expect(ruleBody("html:has(.ph-shell[data-back-bar])")).toMatch(
      /scroll-padding-top:\s*56px/,
    );
    expect(ruleBody('html:has(.ph-shell[data-reserve="tab"])')).toMatch(
      /scroll-padding-bottom:\s*calc\(110px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    expect(ruleBody('html:has(.ph-shell[data-reserve="tab-and-fab"])')).toMatch(
      /scroll-padding-bottom:\s*calc\(170px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
  });

  it("draws the public phone header on one row: the home icon on the gutter, then the pair and Sign in", () => {
    expect(declarations(ruleBody(".ph-landing-header"))).toMatchObject({
      height: "64px",
      padding: "0 20px",
      display: "flex",
    });
    // The 30px icon sits on the gutter: its 44px box reaches 7px into it,
    // its focus ring rounded like the button's.
    expect(declarations(ruleBody(".ph-landing-home"))).toMatchObject({
      width: "44px",
      height: "44px",
      "margin-inline-start": "-7px",
      "border-radius": "12px",
      display: "flex",
      "justify-content": "center",
    });
    expect(declarations(ruleBody(".ph-landing-actions"))).toMatchObject({
      "margin-inline-start": "auto",
      display: "flex",
      gap: "6px",
    });
    // Below 360px the gutter is 16 and the button 4px from the flags, so
    // "Dashboard" (106px) still fits beside the 44 + 44 + 94 at 320.
    const narrow =
      /@media \(max-width: 22\.49rem\)\s*\{([\s\S]*?)\n {2}\}/.exec(css);
    expect(narrow).not.toBeNull();
    expect(
      declarations(/\.ph-landing-header\s*\{([^}]*)\}/.exec(narrow![1])![1]),
    ).toEqual({ "padding-inline": "16px" });
    expect(
      declarations(/\.ph-landing-actions\s*\{([^}]*)\}/.exec(narrow![1])![1]),
    ).toEqual({ gap: "4px" });
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

  it("gives the theme + language pair 44px boxes below md only", () => {
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
    // The phone landing header's flags-only switcher: each radio a 44px square.
    expect(media![1]).toMatch(
      /\.ph-pair \[data-flags-only\] \[role="radio"\]\s*\{\s*min-width:\s*44px;\s*justify-content:\s*center;?\s*\}/,
    );
    // Nothing outside that media rule styles the pair: md and up stays as today.
    const outside = css.replace(media![0], "");
    expect(outside).not.toMatch(/\.ph-pair\b/);
    expect(outside).not.toMatch(/data-flags-only/);
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
  });

  it("leaves no 0021 webhook card behind: v3/AdminWebhook replaced it (PRD 0022)", () => {
    for (const name of [
      "ph-ad-hook",
      "ph-ad-hook-head",
      "ph-ad-hook-label",
      "ph-ad-hook-badges",
      "ph-ad-hook-none",
      "ph-ad-hook-url",
      "ph-ad-hook-actions",
    ]) {
      expect(DECLARED.has(name), `.${name} is still declared`).toBe(false);
    }
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

  it("gives an added list item's move and remove buttons 44px boxes on the CV editor, the new CV and the CV copy, with the row's height kept", () => {
    const actions =
      '.ph-ce-panel [data-slot="cv-item-actions"] > [data-slot="button"]';
    const body = ruleBody(actions);
    expect(body).toMatch(/width:\s*44px !important/);
    expect(body).toMatch(/height:\s*44px !important/);
    // 44 - 12 = 32: the header row stays at the buttons' desktop 32px.
    expect(body).toMatch(/margin-block:\s*-6px/);
    // One rule, inside the phone tree only: `.ph-ce-panel` renders below md.
    expect(
      ALL_SELECTORS.filter((selector) =>
        selector.includes('[data-slot="cv-item-actions"]'),
      ),
    ).toEqual([actions]);
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

// v3 (PRD 0022): the state cards and the check option the K2 boards share,
// and the AdminFeatures (ph-af-), AdminFeatureView (ph-fv-) and AdminWebhook
// (ph-wh-) inline style blocks made classes.
const V3_STATES_AND_CHECK = [
  "ph-state-card",
  "ph-state-t",
  "ph-state-b",
  "ph-alert-card",
  "ph-alert-b",
  "ph-opt-chk",
  "ph-opt-text",
  "ph-opt-l",
  "ph-opt-d",
] as const;

const V3_ADMIN_FEATURES = [
  "ph-af-list",
  "ph-af-card",
  "ph-af-head",
  "ph-af-main",
  "ph-af-title",
  "ph-af-name",
  "ph-af-desc",
  "ph-af-chev",
  "ph-af-dl",
  "ph-af-you",
  "ph-af-you-k",
  "ph-af-yes",
  "ph-af-no",
  "ph-af-you-v",
] as const;

const V3_ADMIN_FEATURE_VIEW = [
  "ph-fv-header",
  "ph-fv-title",
  "ph-fv-name",
  "ph-fv-lead",
  "ph-fv-key",
  "ph-fv-h1",
  "ph-fv-card",
  "ph-fv-card-h",
  "ph-fv-card-head",
  "ph-fv-count",
  "ph-fv-reason",
  "ph-fv-switch-row",
  "ph-fv-switch-l",
  "ph-fv-switch",
  "ph-fv-tools",
  "ph-fv-search",
  "ph-fv-search-input",
  "ph-fv-add",
  "ph-fv-members",
  "ph-fv-member",
  "ph-fv-who",
  "ph-fv-user",
  "ph-fv-email",
  "ph-fv-added",
  "ph-fv-remove",
  "ph-fv-pager",
  "ph-fv-state",
  "ph-fv-state-t",
  "ph-fv-loading",
  "ph-fv-sheet-h",
  "ph-fv-confirm",
  "ph-fv-lines",
  "ph-fv-muted",
  "ph-fv-actions",
  "ph-fv-add-body",
  "ph-fv-add-hint",
  "ph-fv-found",
  "ph-fv-found-list",
  "ph-fv-found-note",
  "ph-fv-found-alert",
  "ph-fv-found-pad",
  "ph-fv-found-more",
  "ph-fv-cand",
  "ph-fv-cand-top",
  "ph-fv-cand-add",
  "ph-fv-listed",
  "ph-fv-status",
  "ph-fv-status-p",
  "ph-fv-ok",
] as const;

const V3_ADMIN_WEBHOOK = [
  "ph-wh-list",
  "ph-wh-card",
  "ph-wh-head",
  "ph-wh-label",
  "ph-wh-del",
  "ph-wh-dl",
  "ph-wh-badges-dd",
  "ph-wh-none",
  "ph-wh-url",
  "ph-wh-sheet-h",
  "ph-wh-sheet-d",
  "ph-wh-form",
  "ph-wh-current-url",
  "ph-wh-badges",
  "ph-wh-legend",
  "ph-wh-error",
  "ph-wh-refusal",
  "ph-wh-actions",
] as const;

describe("phone.css: v3 state cards, check option, AdminFeatures, AdminFeatureView, AdminWebhook", () => {
  it.each([
    ...V3_STATES_AND_CHECK,
    ...V3_ADMIN_FEATURES,
    ...V3_ADMIN_FEATURE_VIEW,
    ...V3_ADMIN_WEBHOOK,
  ])("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("draws the boards' empty and failed-load cards at AdminFeatures' sizes", () => {
    const empty = ruleBody(".ph-card.ph-state-card");
    expect(empty).toMatch(/text-align:\s*center/);
    expect(empty).toMatch(/padding:\s*28px 20px/);
    const title = ruleBody(".ph-state-t");
    expect(title).toMatch(/font-size:\s*16px/);
    expect(title).toMatch(/font-weight:\s*600/);
    expect(ruleBody(".ph-hint.ph-state-b")).toMatch(/margin-top:\s*6px/);
    const alert = ruleBody(".ph-card.ph-alert-card");
    expect(alert).toMatch(/flex-direction:\s*column/);
    expect(alert).toMatch(/gap:\s*10px/);
  });

  it("draws the check option as AdminWebhook's .opt with a box", () => {
    const option = ruleBody(".ph-opt.ph-opt-chk");
    expect(option).toMatch(/width:\s*100%/);
    expect(option).toMatch(/font-size:\s*15px/);
    expect(ruleBody('.ph-opt.ph-opt-chk[aria-invalid="true"]')).toMatch(
      /border-color:\s*var\(--destructive-text\)/,
    );
    expect(ruleBody(".ph-opt-l")).toMatch(/font-weight:\s*600/);
    const description = ruleBody(".ph-opt-d");
    expect(description).toMatch(/margin-top:\s*2px/);
    expect(description).toMatch(/font-size:\s*13px/);
    expect(description).toMatch(/color:\s*var\(--muted-foreground\)/);
  });

  it("draws v3/AdminFeatures' cards at the board's sizes", () => {
    const list = ruleBody(".ph-af-list");
    expect(list).toMatch(/list-style:\s*none/);
    expect(list).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-af-list[data-refreshing]")).toMatch(
      /opacity:\s*0?\.6/,
    );
    const card = ruleBody(".ph-card.ph-af-card");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*12px/);
    expect(card).toMatch(/color:\s*var\(--foreground\)/);
    const head = ruleBody(".ph-af-head");
    expect(head).toMatch(/align-items:\s*flex-start/);
    expect(head).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-af-main")).toMatch(/min-width:\s*0/);
    const title = ruleBody(".ph-af-title");
    expect(title).toMatch(/gap:\s*8px/);
    expect(title).toMatch(/flex-wrap:\s*wrap/);
    const names = ruleBodies(".ph-af-name").join("");
    expect(names).toMatch(/font-size:\s*16px/);
    expect(names).toMatch(/font-weight:\s*600/);
    expect(ruleBodies(".ph-hint.ph-af-desc").join("")).toMatch(
      /margin-top:\s*4px/,
    );
    const chevron = ruleBody(".ph-af-chev");
    expect(chevron).toMatch(/margin-top:\s*2px/);
    expect(chevron).toMatch(/color:\s*var\(--muted-foreground\)/);
    const you = ruleBody(".ph-af-you");
    expect(you).toMatch(/padding-top:\s*10px/);
    expect(you).toMatch(/border-top:\s*1px solid var\(--border\)/);
    expect(you).toMatch(/gap:\s*8px/);
    expect(you).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-af-you-k")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    expect(ruleBody(".ph-af-yes")).toMatch(/color:\s*var\(--success\)/);
    expect(ruleBody(".ph-af-no")).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(ruleBody(".ph-af-you-v")).toMatch(/font-weight:\s*500/);
  });

  it("draws v3/AdminFeatureView's head, cards, members and sheets at the board's sizes", () => {
    expect(ruleBody(".ph-fv-header")).toMatch(/gap:\s*16px/);
    const title = ruleBody(".ph-fv-title");
    expect(title).toMatch(/gap:\s*10px/);
    expect(title).toMatch(/flex-wrap:\s*wrap/);
    const card = ruleBody(".ph-card.ph-fv-card");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*12px/);
    const cardTitle = ruleBody(".ph-fv-card-h");
    expect(cardTitle).toMatch(/font-size:\s*16px/);
    expect(cardTitle).toMatch(/font-weight:\s*600/);
    const reason = ruleBody(".ph-fv-reason");
    expect(reason).toMatch(/font-size:\s*14px/);
    expect(reason).toMatch(/line-height:\s*1\.5/);
    expect(ruleBody(".ph-fv-switch-row")).toMatch(/gap:\s*12px/);
    const switchLabel = ruleBody(".ph-fv-switch-l");
    expect(switchLabel).toMatch(/flex:\s*1/);
    expect(switchLabel).toMatch(/font-size:\s*15px/);
    expect(switchLabel).toMatch(/font-weight:\s*500/);
    // The board's locked switch (`.switch[disabled]`), kept focusable.
    const locked = ruleBody(
      '.ph-switch.ph-fv-switch[aria-disabled="true"]:not([aria-busy="true"])',
    );
    expect(locked).toMatch(/opacity:\s*0?\.45/);
    expect(locked).toMatch(/cursor:\s*default/);
    const head = ruleBody(".ph-fv-card-head");
    expect(head).toMatch(/align-items:\s*baseline/);
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(ruleBody(".ph-fv-count")).toMatch(/font-size:\s*13px/);
    const tools = ruleBody(".ph-fv-tools");
    expect(tools).toMatch(/gap:\s*8px/);
    expect(tools).toMatch(/align-items:\s*flex-end/);
    const search = ruleBody(".ph-input.ph-fv-search-input");
    expect(search).toMatch(/height:\s*44px/);
    expect(search).toMatch(/border-radius:\s*12px/);
    // Add user is drawn 44px tall: its hit box is the shape.
    expect(ruleBody(".ph-btn.ph-sm.ph-fv-add")).toMatch(
      /--ph-hit-inset:\s*0px/,
    );
    expect(ruleBody(".ph-fv-members")).toMatch(/margin:\s*0 -16px -16px/);
    const member = ruleBody(".ph-fv-member");
    expect(member).toMatch(/padding:\s*12px 16px/);
    expect(member).toMatch(/border-top:\s*1px solid var\(--border\)/);
    expect(member).toMatch(/gap:\s*12px/);
    expect(ruleBodies(".ph-fv-user").join("")).toMatch(/font-size:\s*15px/);
    const email = ruleBody(".ph-fv-email");
    expect(email).toMatch(/font-size:\s*13px/);
    expect(email).toMatch(/text-overflow:\s*ellipsis/);
    const added = ruleBody(".ph-fv-added");
    expect(added).toMatch(/margin-top:\s*2px/);
    expect(added).toMatch(/font-size:\s*12px/);
    expect(ruleBody(".ph-pager.ph-fv-pager")).toMatch(
      /border-top:\s*1px solid var\(--border\)/,
    );
    expect(ruleBody(".ph-h2.ph-fv-sheet-h")).toMatch(/padding:\s*4px 0 12px/);
    const confirm = ruleBody(".ph-fv-confirm");
    expect(confirm).toMatch(/gap:\s*10px/);
    expect(confirm).toMatch(/font-size:\s*15px/);
    expect(confirm).toMatch(/line-height:\s*1\.5/);
    expect(ruleBody(".ph-fv-lines > .ph-fv-muted")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    const actions = ruleBody(".ph-fv-actions");
    expect(actions).toMatch(/margin-top:\s*8px/);
    expect(actions).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-fv-actions > .ph-btn:first-child")).toMatch(
      /flex:\s*none/,
    );
    expect(ruleBody(".ph-fv-actions > .ph-btn:last-child")).toMatch(
      /flex:\s*1/,
    );
    expect(ruleBody(".ph-fv-add-body")).toMatch(/gap:\s*12px/);
    expect(ruleBody(".ph-hint.ph-fv-add-hint")).toMatch(/font-size:\s*14px/);
    const found = ruleBody(".ph-fv-found");
    expect(found).toMatch(/border-radius:\s*16px/);
    expect(found).toMatch(/border:\s*1px solid var\(--border\)/);
    const candidate = ruleBody(".ph-fv-cand");
    expect(candidate).toMatch(/min-height:\s*60px/);
    expect(candidate).toMatch(/padding:\s*8px 14px/);
    expect(candidate).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-fv-cand + .ph-fv-cand")).toMatch(
      /border-top:\s*1px solid var\(--border\)/,
    );
    expect(ruleBody(".ph-fv-cand-top")).toMatch(/gap:\s*6px/);
  });

  it("ends a long feature name, username or email in an ellipsis; the key, reason and sheet words wrap (PRD 0022)", () => {
    const names = ruleBodies(".ph-af-name").join("");
    expect(names).toMatch(/text-overflow:\s*ellipsis/);
    expect(names).toMatch(/white-space:\s*nowrap/);
    expect(css).toMatch(
      /\.ph-h1\.ph-fv-name,\s*\.ph-fv-user\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
    expect(ruleBody(".ph-af-title > .ph-pill")).toMatch(/flex:\s*none/);
    expect(ruleBody(".ph-fv-title > .ph-pill")).toMatch(/flex:\s*none/);
    expect(css).toMatch(
      /\.ph-h1\.ph-fv-h1,[^{]*\.ph-fv-key,[^{]*\.ph-fv-reason,[^{]*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    // Portuguese "Adicionar usuário" and "Remover" never wrap.
    expect(ruleBody(".ph-btn.ph-sm.ph-fv-add")).toMatch(
      /white-space:\s*nowrap/,
    );
    expect(ruleBody(".ph-btn.ph-fv-remove")).toMatch(/white-space:\s*nowrap/);
  });

  it("draws v3/AdminWebhook's cards and sheets at the board's sizes", () => {
    const list = ruleBody(".ph-wh-list");
    expect(list).toMatch(/list-style:\s*none/);
    expect(list).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-card.ph-wh-card")).toMatch(/gap:\s*10px/);
    expect(ruleBody(".ph-wh-card[data-deleting]")).toMatch(/opacity:\s*0?\.6/);
    const head = ruleBody(".ph-wh-head");
    expect(head).toMatch(/align-items:\s*center/);
    expect(head).toMatch(/gap:\s*8px/);
    const label = ruleBodies(".ph-wh-label").join("");
    expect(label).toMatch(/font-size:\s*16px/);
    expect(label).toMatch(/font-weight:\s*600/);
    expect(ruleBody(".ph-wh-label[data-unlabelled]")).toMatch(
      /font-style:\s*italic/,
    );
    expect(ruleBody(".ph-iconbtn.ph-wh-del")).toMatch(
      /color:\s*var\(--destructive-text\)/,
    );
    const facts = ruleBody(".ph-wh-dl");
    expect(facts).toMatch(/grid-template-columns:\s*76px minmax\(0, 1fr\)/);
    expect(facts).toMatch(/gap:\s*8px 10px/);
    expect(facts).toMatch(/align-items:\s*center/);
    expect(facts).toMatch(/font-size:\s*13px/);
    expect(ruleBody(".ph-wh-dl dt")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    const badges = ruleBody(".ph-wh-badges-dd");
    expect(badges).toMatch(/gap:\s*4px/);
    expect(badges).toMatch(/flex-wrap:\s*wrap/);
    expect(ruleBody(".ph-wh-none")).toMatch(
      /color:\s*var\(--muted-foreground\)/,
    );
    const url = ruleBody(".ph-wh-url");
    expect(url).toMatch(/font-size:\s*12px/);
    expect(url).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(ruleBody(".ph-h2.ph-wh-sheet-h")).toMatch(/padding-top:\s*4px/);
    const description = ruleBody(".ph-hint.ph-wh-sheet-d");
    expect(description).toMatch(/padding:\s*6px 0 14px/);
    expect(description).toMatch(/font-size:\s*14px/);
    const form = ruleBody(".ph-wh-form");
    expect(form).toMatch(/min-height:\s*0/);
    expect(form).toMatch(/gap:\s*16px/);
    expect(ruleBody(".ph-wh-current-url")).toMatch(/font-size:\s*12px/);
    const group = ruleBody(".ph-wh-badges");
    expect(group).toMatch(/border:\s*0/);
    expect(group).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-lbl.ph-wh-legend")).toMatch(/margin-bottom:\s*6px/);
    expect(ruleBody(".ph-hint.ph-wh-error")).toMatch(
      /color:\s*var\(--destructive-text\)/,
    );
    expect(ruleBody('.ph-wh-form .ph-input[aria-invalid="true"]')).toMatch(
      /border-color:\s*var\(--destructive-text\)/,
    );
    expect(ruleBody(".ph-wh-actions")).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-wh-actions > .ph-btn:first-child")).toMatch(
      /flex:\s*none/,
    );
    expect(ruleBody(".ph-wh-actions > .ph-btn:last-child")).toMatch(
      /flex:\s*1/,
    );
    // A refused delete sits above the buttons with the description's 14px.
    const refusal = ruleBody(".ph-notice.ph-wh-refusal");
    expect(refusal).toMatch(/flex:\s*none/);
    expect(refusal).toMatch(/margin-bottom:\s*14px/);
  });

  it("ends a long webhook label or masked address in an ellipsis (PRD 0022)", () => {
    expect(css).toMatch(
      /\.ph-wh-label,\s*\.ph-wh-url\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
    expect(ruleBody(".ph-wh-badges-dd > .ph-pill")).toMatch(/flex:\s*none/);
  });
});

// v3/Cli (`ph-clp-`; `ph-cli-` is /cli/code's) and v3/CVNew (`ph-cn-`, the
// `.ph-cn` scope): each board's own <style> classes and inline blocks.
const V3_CLI = [
  "ph-clp-tile",
  "ph-clp-eyebrow",
  "ph-clp-h1",
  "ph-clp-pypi",
  "ph-clp-sec",
  "ph-clp-h",
  "ph-clp-body",
  "ph-clp-code",
  "ph-clp-term",
  "ph-clp-p",
  "ph-clp-copy",
  "ph-clp-list",
  "ph-clp-li",
  "ph-clp-b",
  "ph-clp-more",
  "ph-clp-more-h",
  "ph-clp-more-p",
  "ph-clp-more-a",
  "ph-clp-back",
  "ph-clp-back-a",
] as const;

const V3_CV_NEW = [
  "ph-cn",
  "ph-cn-limit",
  "ph-cn-limit-t",
  "ph-cn-pv",
  "ph-cn-pv-h",
  "ph-cn-figure",
] as const;

/** `css` with every run of whitespace made one space: prettier wraps long selectors. */
const flatCss = css.replace(/\s+/g, " ");

/** The body of the first rule whose (whitespace-normalised) selector list holds `selector`. */
function flatRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|[\\s},])${escaped}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`,
  ).exec(flatCss);
  expect(match, `no rule for ${selector}`).not.toBeNull();
  return match![1];
}

describe("phone.css: v3 Cli and CVNew", () => {
  it.each([...V3_CLI, ...V3_CV_NEW])("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("keeps v3/Cli on its own prefix, clear of /cli/code's .ph-cli-", () => {
    const cliPage = [...DECLARED].filter((name) => name.startsWith("ph-clp-"));
    expect(cliPage.sort()).toEqual([...V3_CLI].sort());
  });

  it("draws v3/Cli's hero at the board's sizes", () => {
    const tile = ruleBody(".ph-clp-tile");
    expect(tile).toMatch(/width:\s*56px/);
    expect(tile).toMatch(/height:\s*56px/);
    expect(tile).toMatch(/border-radius:\s*18px/);
    expect(tile).toMatch(/background:\s*var\(--primary-muted\)/);
    expect(tile).toMatch(/color:\s*var\(--primary\)/);
    expect(tile).toMatch(/justify-content:\s*center/);
    expect(ruleBody(".ph-landing-eyebrow.ph-clp-eyebrow")).toMatch(
      /margin-top:\s*20px/,
    );
    const h1 = ruleBody(".ph-clp-h1");
    expect(h1).toMatch(/margin:\s*8px 0 0/);
    expect(h1).toMatch(/font-size:\s*38px/);
    expect(h1).toMatch(/line-height:\s*1\.05/);
    expect(h1).toMatch(/font-weight:\s*700/);
    expect(h1).toMatch(/letter-spacing:\s*-0\.03em/);
    const pypi = ruleBody(".ph-clp-pypi");
    expect(pypi).toMatch(/margin-top:\s*24px/);
    expect(pypi).toMatch(/height:\s*52px/);
    expect(pypi).toMatch(/border-radius:\s*16px/);
    expect(pypi).toMatch(/background:\s*var\(--primary\)/);
    expect(pypi).toMatch(/color:\s*var\(--primary-foreground\)/);
    expect(pypi).toMatch(/gap:\s*8px/);
    expect(pypi).toMatch(/font-size:\s*15px/);
    expect(pypi).toMatch(/font-weight:\s*600/);
  });

  it("draws v3/Cli's sections, bodies, codes and the sign-in list at the board's sizes", () => {
    expect(ruleBody(".ph-clp-sec")).toMatch(/padding:\s*48px 20px 0/);
    const h = ruleBody(".ph-clp-h");
    expect(h).toMatch(/font-size:\s*20px/);
    expect(h).toMatch(/font-weight:\s*700/);
    expect(h).toMatch(/letter-spacing:\s*-0\.02em/);
    const body = ruleBody(".ph-clp-body");
    expect(body).toMatch(/margin:\s*8px 0 0/);
    expect(body).toMatch(/font-size:\s*15px/);
    expect(body).toMatch(/line-height:\s*1\.55/);
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(css).toMatch(
      /\.ph-clp-body strong,\s*\.ph-clp-li strong\s*\{[^}]*color:\s*var\(--foreground\)[^}]*font-weight:\s*600/,
    );
    const code = ruleBody(".ph-clp-code");
    expect(code).toMatch(/padding:\s*1px 6px/);
    expect(code).toMatch(/border-radius:\s*6px/);
    expect(code).toMatch(/background:\s*var\(--muted\)/);
    expect(code).toMatch(/font-size:\s*13px/);
    const list = ruleBody(".ph-clp-list");
    expect(list).toMatch(/list-style:\s*none/);
    expect(list).toMatch(/margin:\s*16px 0 0/);
    expect(list).toMatch(/flex-direction:\s*column/);
    expect(list).toMatch(/gap:\s*12px/);
    const li = ruleBody(".ph-clp-li");
    expect(li).toMatch(/display:\s*flex/);
    expect(li).toMatch(/gap:\s*12px/);
    expect(li).toMatch(/align-items:\s*flex-start/);
    expect(li).toMatch(/font-size:\s*15px/);
    expect(li).toMatch(/line-height:\s*1\.55/);
    expect(li).toMatch(/color:\s*var\(--muted-foreground\)/);
    const bullet = ruleBody(".ph-clp-b");
    expect(bullet).toMatch(/width:\s*6px/);
    expect(bullet).toMatch(/height:\s*6px/);
    expect(bullet).toMatch(/border-radius:\s*999px/);
    expect(bullet).toMatch(/margin-top:\s*9px/);
    expect(bullet).toMatch(/background:\s*var\(--primary\)/);
  });

  it("draws v3/Cli's terminal: the pre scrolls inside itself, the prompt is never selected, Copy is 44px", () => {
    const term = ruleBody(".ph-clp-term");
    expect(term).toMatch(/margin-top:\s*16px/);
    expect(term).toMatch(/border-radius:\s*16px/);
    expect(term).toMatch(/background:\s*var\(--surface\)/);
    expect(term).toMatch(/border:\s*1px solid var\(--border\)/);
    expect(term).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
    expect(term).toMatch(/display:\s*flex/);
    expect(term).toMatch(/align-items:\s*flex-start/);
    expect(term).toMatch(/gap:\s*4px/);
    expect(term).toMatch(/padding:\s*6px 6px 6px 0/);
    const pre = ruleBody(".ph-clp-term > pre");
    expect(pre).toMatch(/flex:\s*1/);
    expect(pre).toMatch(/min-width:\s*0/);
    expect(pre).toMatch(/padding:\s*10px 0 10px 16px/);
    expect(pre).toMatch(/font-size:\s*13px/);
    expect(pre).toMatch(/line-height:\s*1\.75/);
    expect(pre).toMatch(/white-space:\s*pre/);
    const prompt = ruleBody(".ph-clp-p");
    expect(prompt).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(prompt).toMatch(/-webkit-user-select:\s*none/);
    expect(prompt).toMatch(/(?:^|[^-])user-select:\s*none/);
    const copy = ruleBody(".ph-clp-copy");
    expect(copy).toMatch(/width:\s*44px/);
    expect(copy).toMatch(/height:\s*44px/);
    expect(copy).toMatch(/border-radius:\s*12px/);
    expect(copy).toMatch(/background:\s*transparent/);
    expect(copy).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(ruleBody('.ph-clp-copy[data-done="true"]')).toMatch(
      /color:\s*var\(--primary\)/,
    );
  });

  it("draws v3/Cli's Everything else card, the line back home and the footer at the board's sizes", () => {
    const more = ruleBody(".ph-clp-more");
    expect(more).toMatch(/margin:\s*48px 20px 0/);
    expect(more).toMatch(/padding:\s*24px/);
    expect(more).toMatch(/border-radius:\s*24px/);
    expect(more).toMatch(/background:\s*var\(--surface\)/);
    expect(more).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
    const moreH = ruleBody(".ph-clp-more-h");
    expect(moreH).toMatch(/font-size:\s*17px/);
    expect(moreH).toMatch(/font-weight:\s*600/);
    const moreP = ruleBody(".ph-clp-more-p");
    expect(moreP).toMatch(/margin:\s*6px 0 0/);
    expect(moreP).toMatch(/font-size:\s*15px/);
    expect(moreP).toMatch(/line-height:\s*1\.55/);
    expect(moreP).toMatch(/color:\s*var\(--muted-foreground\)/);
    const moreA = ruleBody(".ph-clp-more-a");
    expect(moreA).toMatch(/margin-top:\s*8px/);
    expect(moreA).toMatch(/min-height:\s*44px/);
    expect(moreA).toMatch(/display:\s*inline-flex/);
    expect(moreA).toMatch(/gap:\s*6px/);
    expect(moreA).toMatch(/font-size:\s*15px/);
    expect(moreA).toMatch(/font-weight:\s*600/);
    const back = ruleBody(".ph-clp-back");
    expect(back).toMatch(/margin:\s*32px 20px 0/);
    expect(back).toMatch(/font-size:\s*15px/);
    expect(back).toMatch(/color:\s*var\(--muted-foreground\)/);
    const backA = ruleBody(".ph-clp-back-a");
    expect(backA).toMatch(/display:\s*inline-flex/);
    expect(backA).toMatch(/min-height:\s*44px/);
    expect(backA).toMatch(/font-weight:\s*600/);
  });

  it("draws v3/CVNew's limit card at the board's sizes", () => {
    const limit = ruleBody(".ph-cn-limit");
    expect(limit).toMatch(/padding:\s*24px 20px/);
    expect(limit).toMatch(/border-radius:\s*20px/);
    expect(limit).toMatch(/border:\s*2px dashed var\(--border-strong\)/);
    expect(limit).toMatch(/flex-direction:\s*column/);
    expect(limit).toMatch(/gap:\s*14px/);
    expect(limit).toMatch(/text-align:\s*center/);
    const sentence = ruleBody(".ph-cn-limit-t");
    expect(sentence).toMatch(/font-size:\s*15px/);
    expect(sentence).toMatch(/line-height:\s*1\.5/);
  });

  it("draws v3/CVNew's own fields as its .lbl, .req and .hint, inside .ph-cn (and the copy editor's .ph-acv) only", () => {
    expect(
      flatRuleBody('.ph-cn [data-section="identity"] > .ph-ce-panel > div'),
    ).toMatch(/gap:\s*12px !important/);
    for (const section of ["identity", "summary"]) {
      const panel = `.ph-cn [data-section="${section}"] > .ph-ce-panel`;
      const label = flatRuleBody(`${panel} label > span:first-child`);
      expect(label, section).toMatch(/font-size:\s*13px !important/);
      expect(label, section).toMatch(/line-height:\s*normal !important/);
      expect(label, section).toMatch(/font-weight:\s*600 !important/);
      expect(label, section).toMatch(/color:\s*var\(--muted-foreground\)/);
      expect(
        flatRuleBody(
          `${panel} label > span:first-child > [aria-hidden="true"]`,
        ),
        section,
      ).toMatch(/color:\s*var\(--destructive-text\) !important/);
      const hint = flatRuleBody(`${panel} label ~ p`);
      expect(hint, section).toMatch(/font-size:\s*13px !important/);
      expect(hint, section).toMatch(/line-height:\s*1\.45 !important/);
      expect(flatRuleBody(`${panel} label ~ p[id]`), section).toMatch(
        /color:\s*var\(--destructive-text\) !important/,
      );
    }
  });

  it("draws v3/CVNew's list panels: the empty hint, the error line and Add as .btn.sec.sm in a 44px box", () => {
    const empty = flatRuleBody(".ph-cn .ph-ce-panel > p:first-child");
    expect(empty).toMatch(/padding:\s*0 !important/);
    expect(empty).toMatch(/border:\s*0 !important/);
    expect(empty).toMatch(/border-radius:\s*0 !important/);
    expect(empty).toMatch(/text-align:\s*start !important/);
    expect(empty).toMatch(/font-size:\s*13px !important/);
    expect(empty).toMatch(/line-height:\s*1\.45 !important/);
    const error = flatRuleBody(".ph-cn .ph-ce-panel > p[id]");
    expect(error).toMatch(/margin-top:\s*0 !important/);
    expect(error).toMatch(/font-size:\s*13px !important/);
    expect(error).toMatch(/line-height:\s*1\.45 !important/);
    expect(error).toMatch(/color:\s*var\(--destructive-text\) !important/);

    const add =
      '.ph-cn .ph-ce-panel > div > [data-slot="button"][data-variant="outline"][data-size="sm"]';
    const wrap = flatRuleBody(
      '.ph-cn .ph-ce-panel > div:has(> [data-slot="button"][data-variant="outline"][data-size="sm"])',
    );
    expect(wrap).toMatch(/margin-top:\s*0 !important/);
    expect(wrap).toMatch(/display:\s*flex/);
    const button = flatRuleBody(add);
    expect(button).toMatch(/height:\s*44px !important/);
    expect(button).toMatch(/margin-block:\s*-2px/);
    expect(button).toMatch(/padding:\s*0 14px !important/);
    expect(button).toMatch(/gap:\s*8px !important/);
    expect(button).toMatch(/border:\s*0 !important/);
    expect(button).toMatch(/border-radius:\s*12px !important/);
    expect(button).toMatch(/background:\s*transparent !important/);
    expect(button).toMatch(/box-shadow:\s*none !important/);
    expect(button).toMatch(/color:\s*var\(--foreground\) !important/);
    expect(button).toMatch(/font-size:\s*14px !important/);
    expect(button).toMatch(/font-weight:\s*600 !important/);
    const shape = flatRuleBody(`${add}::before`);
    expect(shape).toMatch(/inset:\s*2px 0/);
    expect(shape).toMatch(/background:\s*var\(--muted\)/);
    const ring = flatRuleBody(`${add}:focus-visible::before`);
    expect(ring).toMatch(/outline:\s*2px solid var\(--primary\)/);
    expect(ring).toMatch(/outline-offset:\s*2px/);
    expect(flatRuleBody(`${add} > svg`)).toMatch(/stroke-width:\s*2\.5/);
  });

  it("draws v3/CVNew's Live preview card: today's preview in a 210px column, the sheet r6, the indicator and caption centred", () => {
    const card = ruleBody(".ph-card.ph-cn-pv");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*12px/);
    expect(card).toMatch(/align-items:\s*center/);
    const h = ruleBody(".ph-cn-pv-h");
    expect(h).toMatch(/align-self:\s*flex-start/);
    expect(h).toMatch(/font-size:\s*12px/);
    expect(h).toMatch(/font-weight:\s*600/);
    expect(h).toMatch(/letter-spacing:\s*0\.08em/);
    expect(h).toMatch(/text-transform:\s*uppercase/);
    expect(h).toMatch(/color:\s*var\(--muted-foreground\)/);
    const figure = ruleBody(".ph-cn-figure");
    expect(figure).toMatch(/position:\s*relative/);
    expect(figure).toMatch(/align-self:\s*stretch/);
    expect(figure).toMatch(/flex-direction:\s*column/);
    expect(figure).toMatch(/align-items:\s*center/);
    expect(figure).toMatch(/gap:\s*12px/);
    const frame = ruleBody('.ph-cn-figure > [role="group"]');
    expect(frame).toMatch(/width:\s*210px/);
    expect(frame).toMatch(/max-width:\s*100%/);
    expect(frame).toMatch(/margin-block:\s*0 !important/);
    const sheet = ruleBody(
      '.ph-cn-figure [data-slot="cv-page"] > div:first-child',
    );
    expect(sheet).toMatch(/border-radius:\s*6px/);
    expect(sheet).toMatch(/box-shadow:\s*var\(--shadow-elevated\) !important/);
    const indicator = ruleBody(
      '.ph-cn-figure [data-slot="cv-page"] > div:last-child',
    );
    expect(indicator).toMatch(/margin-top:\s*12px !important/);
    expect(indicator).toMatch(/flex-wrap:\s*wrap/);
    expect(indicator).toMatch(/justify-content:\s*center !important/);
    const count = ruleBody(
      '.ph-cn-figure [data-slot="cv-page"] > div:last-child > p:last-child',
    );
    expect(count).toMatch(/margin-left:\s*0 !important/);
    expect(count).toMatch(/font-size:\s*12px !important/);
    expect(count).toMatch(/line-height:\s*normal !important/);
    const caption = ruleBody(".ph-cn-figure > figcaption");
    expect(caption).toMatch(/justify-content:\s*center/);
    expect(caption).toMatch(/font-size:\s*13px !important/);
    expect(caption).toMatch(/line-height:\s*1\.45 !important/);
    expect(caption).toMatch(/text-align:\s*center/);
    expect(ruleBody(".ph-cn-figure > figcaption > svg")).toMatch(
      /display:\s*none/,
    );
  });

  it("restyles today's CV fields on /cvs/new only: every CVNew rule sits under .ph-cn or a ph-cn- class", () => {
    const rules = ALL_SELECTORS.flatMap((list) => list.split(","))
      .map((selector) => selector.trim())
      .filter((selector) => /ph-cn\b|ph-cn-/.test(selector));
    expect(rules.length).toBeGreaterThan(0);
    for (const selector of rules) {
      expect(selector, selector).toMatch(/^\.ph-cn[\s.-]|^\.ph-card\.ph-cn-/);
    }
  });
});

// v3/ApplicationCV (`ph-acv-`, the `.ph-acv` scope): the board's own <style>
// classes and inline blocks.
const V3_ACV = [
  "ph-acv-form",
  "ph-acv-pick",
  "ph-acv-pick-body",
  "ph-acv-hint",
  "ph-acv-group",
  "ph-acv-choice",
  "ph-acv-opt",
  "ph-acv-opt-text",
  "ph-acv-name",
  "ph-acv-upd",
  "ph-acv-who",
  "ph-acv-acts",
  "ph-acv-act",
  "ph-acv-del",
  "ph-acv-new",
  "ph-acv-tailor",
  "ph-acv-tailor-text",
  "ph-acv-tailor-t",
  "ph-acv-locked",
  "ph-acv-banner",
  "ph-acv-banner-ic",
  "ph-acv-banner-text",
  "ph-acv-banner-t",
  "ph-acv-banner-b",
  "ph-acv-src",
  "ph-acv-jd",
  "ph-acv-h2",
  "ph-acv-jd-text",
  "ph-acv-clamp",
  "ph-acv-more",
  "ph-acv-add",
  "ph-acv-fit",
  "ph-acv-fit-head",
  "ph-acv-fit-pill",
  "ph-acv-kw-h",
  "ph-acv-fit-err",
  "ph-acv-fit-err-t",
  "ph-acv-chg",
  "ph-acv-row",
  "ph-acv-chg-l",
  "ph-acv-cmp",
  "ph-acv-moves",
  "ph-acv-dl",
  "ph-acv-dl-l",
  "ph-acv-foot",
  "ph-acv-grow",
  "ph-acv-full",
] as const;

/** K3's v3/CVNew field and list rules the copy editor shares: each `.ph-cn` selector and its `.ph-acv` twin. */
const ACV_TWINS: [cvNew: string, copy: string][] = [
  [
    '.ph-cn [data-section="identity"] > .ph-ce-panel > div',
    '.ph-acv [data-section="identity"] > .ph-ce-panel > div',
  ],
  ...(["identity", "summary"] as const).flatMap((section) => {
    const cn = `.ph-cn [data-section="${section}"] > .ph-ce-panel`;
    const acv = `.ph-acv [data-section="${section}"] > .ph-ce-panel`;
    return [
      "label > span:first-child",
      'label > span:first-child > [aria-hidden="true"]',
      "label ~ p",
      "label ~ p[id]",
    ].map((tail): [string, string] => [`${cn} ${tail}`, `${acv} ${tail}`]);
  }),
  // The copy's rows open with the section's description: the empty hint follows it.
  [
    ".ph-cn .ph-ce-panel > p:first-child",
    ".ph-acv .ph-ce-panel > .ph-hint + p",
  ],
  [".ph-cn .ph-ce-panel > p[id]", ".ph-acv .ph-ce-panel > p[id]"],
  ...[
    'div:has(> [data-slot="button"][data-variant="outline"][data-size="sm"])',
    'div > [data-slot="button"][data-variant="outline"][data-size="sm"]',
    'div > [data-slot="button"][data-variant="outline"][data-size="sm"]::before',
    'div > [data-slot="button"][data-variant="outline"][data-size="sm"]:focus-visible::before',
    'div > [data-slot="button"][data-variant="outline"][data-size="sm"] > svg',
  ].map((tail): [string, string] => [
    `.ph-cn .ph-ce-panel > ${tail}`,
    `.ph-acv .ph-ce-panel > ${tail}`,
  ]),
];

describe("phone.css: v3 ApplicationCV", () => {
  it.each(["ph-acv", ...V3_ACV])("declares .%s", (name) => {
    expect(DECLARED.has(name), `.${name} is not declared`).toBe(true);
  });

  it("keeps ApplicationCV on its own prefix", () => {
    const board = [...DECLARED].filter((name) => name.startsWith("ph-acv-"));
    expect(board.sort()).toEqual([...V3_ACV].sort());
  });

  it("every ApplicationCV selector sits under .ph-acv or a ph-acv- class, or is the shared .ph-pick radio dot", () => {
    const rules = ALL_SELECTORS.flatMap((list) => list.split(","))
      .map((selector) => selector.trim())
      .filter((selector) => /ph-acv\b|ph-acv-/.test(selector));
    expect(rules.length).toBeGreaterThan(0);
    for (const selector of rules) {
      expect(selector, selector).toMatch(
        /^\.ph-acv[\s-]|^\.ph-(?:hint|pick|btn|app|card|pill)[.\s][^,]*ph-acv/,
      );
    }
    const loose = ALL_SELECTORS.filter((list) =>
      /^\.ph-pick\.ph-on \.ph-radio/.test(list),
    );
    expect(loose).toEqual([
      ".ph-pick.ph-on .ph-radio",
      ".ph-pick.ph-on .ph-radio::after",
    ]);
  });

  it.each(ACV_TWINS)(
    "shares v3/CVNew's field rule %s with the copy editor",
    (cvNew, copy) => {
      expect(flatRuleBody(copy)).toBe(flatRuleBody(cvNew));
    },
  );

  it("lays the screen out as drawn: the form and the picker in columns", () => {
    const form = ruleBody(".ph-acv-form");
    expect(form).toMatch(/flex-direction:\s*column/);
    expect(form).toMatch(/gap:\s*16px/);
    const pick = flatRuleBody(".ph-acv-pick");
    expect(pick).toMatch(/flex-direction:\s*column/);
    expect(pick).toMatch(/gap:\s*12px/);
    expect(flatRuleBody(".ph-acv-pick-body")).toBe(pick);
    expect(ruleBodies(".ph-acv-pick-body").at(-1)).toMatch(/outline:\s*none/);
    expect(ruleBody(".ph-hint.ph-acv-hint")).toMatch(/margin-top:\s*4px/);
    const group = ruleBody(".ph-acv-group");
    expect(group).toMatch(/flex-direction:\s*column/);
    expect(group).toMatch(/gap:\s*10px/);
  });

  it("draws a choice as the board's .pick: the label row, the dot, the name, update and who", () => {
    expect(ruleBody(".ph-pick.ph-acv-choice")).toMatch(
      /transition:\s*opacity 0\.2s/,
    );
    expect(ruleBody(".ph-pick.ph-acv-choice[data-deleting]")).toMatch(
      /opacity:\s*0\.6/,
    );
    const opt = ruleBody(".ph-acv-opt");
    expect(opt).toMatch(/position:\s*relative/);
    expect(opt).toMatch(/width:\s*100%/);
    expect(opt).toMatch(/display:\s*flex/);
    expect(opt).toMatch(/gap:\s*12px/);
    expect(opt).toMatch(/align-items:\s*flex-start/);
    expect(opt).toMatch(/color:\s*var\(--foreground\)/);
    expect(opt).toMatch(/text-align:\s*left/);
    expect(opt).toMatch(/cursor:\s*pointer/);
    const ring = ruleBody(".ph-app .ph-acv-opt:has(> input:focus-visible)");
    expect(ring).toMatch(/outline:\s*2px solid var\(--primary\)/);
    expect(ring).toMatch(/outline-offset:\s*2px/);
    expect(ruleBody(".ph-pick.ph-on .ph-radio")).toMatch(
      /border-color:\s*var\(--primary\)/,
    );
    const dot = ruleBody(".ph-pick.ph-on .ph-radio::after");
    expect(dot).toMatch(/content:\s*""/);
    expect(dot).toMatch(/width:\s*10px/);
    expect(dot).toMatch(/height:\s*10px/);
    expect(dot).toMatch(/border-radius:\s*999px/);
    expect(dot).toMatch(/background:\s*var\(--primary\)/);
    const text = ruleBody(".ph-acv-opt-text");
    expect(text).toMatch(/flex:\s*1/);
    expect(text).toMatch(/min-width:\s*0/);
    const name = ruleBody(".ph-acv-name");
    expect(name).toMatch(/display:\s*block/);
    expect(name).toMatch(/font-size:\s*16px/);
    expect(name).toMatch(/font-weight:\s*600/);
    expect(name).toMatch(/overflow-wrap:\s*anywhere/);
    const updated = ruleBody(".ph-acv-upd");
    expect(updated).toMatch(/margin-top:\s*2px/);
    expect(updated).toMatch(/font-size:\s*12px/);
    expect(updated).toMatch(/color:\s*var\(--muted-foreground\)/);
    const who = ruleBody(".ph-acv-who");
    expect(who).toMatch(/margin-top:\s*4px/);
    expect(who).toMatch(/font-size:\s*13px/);
    expect(who).toMatch(/color:\s*var\(--muted-foreground\)/);
    expect(who).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("draws the card actions, the new tile and the Tailor card at the board's sizes", () => {
    const acts = ruleBody(".ph-acv-acts");
    expect(acts).toMatch(/flex-wrap:\s*wrap/);
    expect(acts).toMatch(/gap:\s*6px/);
    const act = ruleBody(".ph-btn.ph-sm.ph-acv-act");
    expect(act).toMatch(/flex:\s*1/);
    expect(act).toMatch(/padding:\s*0 10px/);
    expect(act).toMatch(/white-space:\s*nowrap/);
    const del = ruleBody(".ph-btn.ph-sm.ph-acv-del");
    expect(del).toMatch(/padding:\s*0 12px/);
    expect(del).toMatch(/white-space:\s*nowrap/);
    const tile = ruleBody(".ph-app .ph-cv-new.ph-acv-new");
    expect(tile).toMatch(/min-height:\s*96px/);
    expect(tile).toMatch(/gap:\s*4px/);
    const tailor = ruleBody(".ph-card.ph-acv-tailor");
    expect(tailor).toMatch(/display:\s*flex/);
    expect(tailor).toMatch(/gap:\s*12px/);
    expect(tailor).toMatch(/align-items:\s*flex-start/);
    const tailorText = ruleBody(".ph-acv-tailor-text");
    expect(tailorText).toMatch(/flex:\s*1/);
    expect(tailorText).toMatch(/min-width:\s*0/);
    const tailorT = ruleBody(".ph-acv-tailor-t");
    expect(tailorT).toMatch(/display:\s*block/);
    expect(tailorT).toMatch(/font-size:\s*15px/);
    expect(tailorT).toMatch(/font-weight:\s*600/);
    expect(tailorT).toMatch(/cursor:\s*pointer/);
    const locked = ruleBody(".ph-acv-locked");
    expect(locked).toMatch(/padding:\s*24px 20px/);
    expect(locked).toMatch(/border-radius:\s*20px/);
    expect(locked).toMatch(/border:\s*2px dashed var\(--border-strong\)/);
    expect(locked).toMatch(/text-align:\s*center/);
    expect(locked).toMatch(/font-size:\s*15px/);
    expect(locked).toMatch(/line-height:\s*1\.5/);
    expect(locked).toMatch(/color:\s*var\(--muted-foreground\)/);
  });

  it("draws the read-only banner in the warning tint, and the source pill's column", () => {
    const banner = ruleBody(".ph-acv-banner");
    expect(banner).toMatch(/padding:\s*14px/);
    expect(banner).toMatch(/border-radius:\s*16px/);
    expect(banner).toMatch(
      /border:\s*1px solid color-mix\(in oklab, var\(--warning\) 45%, transparent\)/,
    );
    expect(banner).toMatch(
      /background:\s*color-mix\(in oklab, var\(--warning\) 12%, transparent\)/,
    );
    expect(banner).toMatch(/display:\s*flex/);
    expect(banner).toMatch(/gap:\s*10px/);
    const icon = ruleBody(".ph-acv-banner-ic");
    expect(icon).toMatch(/flex:\s*none/);
    expect(icon).toMatch(/margin-top:\s*1px/);
    expect(icon).toMatch(/color:\s*var\(--warning\)/);
    const text = ruleBody(".ph-acv-banner-text");
    expect(text).toMatch(/min-width:\s*0/);
    expect(text).toMatch(/font-size:\s*14px/);
    expect(text).toMatch(/line-height:\s*1\.45/);
    const title = ruleBody(".ph-acv-banner-t");
    expect(title).toMatch(/margin:\s*0/);
    expect(title).toMatch(/font-weight:\s*600/);
    const body = ruleBody(".ph-acv-banner-b");
    expect(body).toMatch(/margin:\s*2px 0 0/);
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/);
    const source = ruleBody(".ph-acv-src");
    expect(source).toMatch(/flex-direction:\s*column/);
    expect(source).toMatch(/align-items:\s*flex-start/);
    expect(source).toMatch(/gap:\s*6px/);
  });

  it("draws the job description card: four lines, then Show more in a 44px box", () => {
    const card = ruleBody(".ph-card.ph-acv-jd");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*8px/);
    const h2 = ruleBody(".ph-acv-h2");
    expect(h2).toMatch(/margin:\s*0/);
    expect(h2).toMatch(/font-size:\s*15px/);
    expect(h2).toMatch(/font-weight:\s*600/);
    const text = ruleBody(".ph-acv-jd-text");
    expect(text).toMatch(/margin:\s*0/);
    expect(text).toMatch(/font-size:\s*14px/);
    expect(text).toMatch(/line-height:\s*1\.55/);
    expect(text).toMatch(/white-space:\s*pre-wrap/);
    expect(text).toMatch(/overflow-wrap:\s*anywhere/);
    const clamp = ruleBody(".ph-acv-jd-text.ph-acv-clamp");
    expect(clamp).toMatch(/display:\s*-webkit-box/);
    expect(clamp).toMatch(/-webkit-line-clamp:\s*4/);
    expect(clamp).toMatch(/-webkit-box-orient:\s*vertical/);
    expect(clamp).toMatch(/overflow:\s*hidden/);
    const more = ruleBody(".ph-acv-more");
    expect(more).toMatch(/align-self:\s*flex-start/);
    expect(more).toMatch(/min-height:\s*44px/);
    expect(more).toMatch(/margin:\s*-10px 0 -12px/);
    expect(more).toMatch(/background:\s*transparent/);
    expect(more).toMatch(/color:\s*var\(--primary\)/);
    expect(more).toMatch(/font-size:\s*14px/);
    expect(more).toMatch(/font-weight:\s*600/);
    expect(ruleBody(".ph-btn.ph-sm.ph-acv-add")).toMatch(
      /align-self:\s*flex-start/,
    );
  });

  it("draws the fit card: the head, the pill, Matched and Missing, the error", () => {
    const card = ruleBody(".ph-card.ph-acv-fit");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*10px/);
    expect(card).toMatch(/outline:\s*none/);
    const head = ruleBody(".ph-acv-fit-head");
    expect(head).toMatch(/display:\s*flex/);
    expect(head).toMatch(/align-items:\s*center/);
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(head).toMatch(/gap:\s*8px/);
    expect(ruleBody(".ph-pill.ph-acv-fit-pill")).toMatch(/flex:\s*none/);
    const kw = ruleBody(".ph-acv-kw-h");
    expect(kw).toMatch(/margin:\s*4px 0 0/);
    expect(kw).toMatch(/font-size:\s*13px/);
    expect(kw).toMatch(/font-weight:\s*600/);
    const error = ruleBody(".ph-acv-fit-err");
    expect(error).toMatch(/flex-direction:\s*column/);
    expect(error).toMatch(/align-items:\s*flex-start/);
    expect(error).toMatch(/gap:\s*10px/);
    const errorText = ruleBody(".ph-acv-fit-err-t");
    expect(errorText).toMatch(/margin:\s*0/);
    expect(errorText).toMatch(/font-size:\s*14px/);
  });

  it("draws the Changes card: the switch row, the compared line, the moves inline, Download changes", () => {
    const card = ruleBody(".ph-card.ph-acv-chg");
    expect(card).toMatch(/flex-direction:\s*column/);
    expect(card).toMatch(/gap:\s*12px/);
    const row = ruleBody(".ph-acv-row");
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/align-items:\s*center/);
    expect(row).toMatch(/gap:\s*12px/);
    const label = ruleBody(".ph-acv-chg-l");
    expect(label).toMatch(/flex:\s*1/);
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/font-size:\s*15px/);
    expect(label).toMatch(/font-weight:\s*600/);
    expect(label).toMatch(/cursor:\s*pointer/);
    const compared = ruleBody(".ph-acv-cmp");
    expect(compared).toMatch(/margin:\s*0/);
    expect(compared).toMatch(/font-size:\s*14px/);
    expect(compared).toMatch(/overflow-wrap:\s*anywhere/);
    const moves = ruleBody(".ph-acv-moves");
    expect(moves).toMatch(/display:\s*inline/);
    expect(moves).toMatch(/margin:\s*0/);
    expect(moves).toMatch(/padding:\s*0/);
    expect(moves).toMatch(/list-style:\s*none/);
    expect(ruleBody(".ph-acv-moves > li")).toMatch(/display:\s*inline/);
    expect(ruleBody(".ph-acv-moves > li + li::before")).toMatch(
      /content:\s*", "/,
    );
    const dl = ruleBody(".ph-acv-dl");
    expect(dl).toMatch(/display:\s*flex/);
    expect(dl).toMatch(/align-items:\s*center/);
    expect(dl).toMatch(/gap:\s*6px/);
    const dlLabel = ruleBody(".ph-acv-dl-l");
    expect(dlLabel).toMatch(/flex:\s*1/);
    expect(dlLabel).toMatch(/min-width:\s*0/);
    expect(dlLabel).toMatch(/font-size:\s*14px/);
    expect(dlLabel).toMatch(/font-weight:\s*500/);
  });

  it("draws the downloads row: two halves, Delete copy on its own line", () => {
    const foot = ruleBody(".ph-acv-foot");
    expect(foot).toMatch(/display:\s*flex/);
    expect(foot).toMatch(/flex-wrap:\s*wrap/);
    expect(foot).toMatch(/gap:\s*8px/);
    const grow = ruleBody(".ph-btn.ph-sm.ph-acv-grow");
    expect(grow).toMatch(/flex:\s*1/);
    expect(grow).toMatch(/white-space:\s*nowrap/);
    expect(ruleBody(".ph-btn.ph-sm.ph-acv-full")).toMatch(/flex:\s*1 0 100%/);
  });
});

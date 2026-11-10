import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import { LocaleProvider } from "@/i18n/locale-provider";
import { mockPhoneViewport } from "@/test/phone";

import {
  BORDERLESS_BADGE_SRC,
  SIGN_IN_ERROR_CODES,
  SignInScreen,
  signInErrorKey,
  type SignInScreenProps,
} from "./sign-in-screen";

/**
 * The sign-in page: option C below md (signin/C_Mobile, its CTA now with
 * Borderless's logo before the label, as option A draws it) and option A at
 * md and up (signin/A_Desktop: the paired tiles, the card, the sign-up line),
 * with v2/SignIn's states inside each. Both trees are in the DOM and CSS
 * shows one (jsdom applies no stylesheet), so every query is scoped to a tree
 * by its `data-slot`; the theme + language pair sits outside both, mounted
 * once, theme first.
 */

const SIGN_UP = "https://borderless.example/sign-up";
const ERRORS = en.errors as Record<string, string>;

/** Each tree's own words: C's below md, A's at md and up. */
const TREES = [
  [
    "phone",
    "sign-in-phone",
    {
      h1: "One account for your whole job search",
      lead: "Sign in with Borderless. It confirms it's you and sends you back here.",
      cta: "Continue with Borderless",
      signUp: "I don't have a Borderless account",
    },
  ],
  [
    "desktop",
    "sign-in-desktop",
    {
      h1: "Sign in to applika",
      lead: "Use your Borderless account. Borderless confirms it's you and sends you back here.",
      cta: "Sign in with Borderless",
      signUp: "Create a Borderless account",
    },
  ],
] as const;

function renderScreen(props: Partial<SignInScreenProps> = {}) {
  const onSignIn = vi.fn();
  const result = render(
    <SignInScreen onSignIn={onSignIn} createAccountHref={SIGN_UP} {...props} />,
    { wrapper: LocaleProvider },
  );
  return { ...result, onSignIn };
}

function tree(slot: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  expect(node, slot).not.toBeNull();
  return node!;
}

function cta(slot: string): HTMLElement {
  return tree(slot).querySelector<HTMLElement>(
    'button[data-action="sign-in-borderless"]',
  )!;
}

function errorBox(slot: string): HTMLElement {
  return tree(slot).querySelector<HTMLElement>('[data-slot="sign-in-error"]')!;
}

describe("signInErrorKey", () => {
  it("passes a listed code, reads anything else as unknown, nothing as null", () => {
    expect(signInErrorKey("AUTH-1046")).toBe("AUTH-1046");
    expect(signInErrorKey("NOPE-0000")).toBe("unknown");
    // A catalog code with ICU arguments is not listed: its words need values.
    expect(signInErrorKey("GEN-1004")).toBe("unknown");
    expect(signInErrorKey("")).toBeNull();
    expect(signInErrorKey(null)).toBeNull();
  });
});

describe.each(TREES)("SignInScreen, %s tree", (_name, slot, words) => {
  it("ready: the board's heading, lead, CTA and account link", () => {
    renderScreen({ autoFocus: false });
    const view = within(tree(slot));

    expect(
      view.getByRole("heading", { level: 1, name: words.h1 }),
    ).toBeVisible();
    const button = view.getByRole("button", { name: words.cta });
    expect(button).toBe(cta(slot));
    // Described by this tree's own lead, never the other tree's.
    const leadId = button.getAttribute("aria-describedby")!;
    const lead = document.getElementById(leadId);
    expect(tree(slot)).toContainElement(lead);
    expect(lead).toHaveTextContent(words.lead);
    expect(button).toHaveAccessibleDescription(words.lead);
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(errorBox(slot)).toBeEmptyDOMElement();
    expect(
      tree(slot).querySelector('[data-slot="sign-in-cli-hint"]'),
    ).toBeNull();
  });

  it("ready: Borderless's logo before the label, decorative, as option A draws it", () => {
    renderScreen({ autoFocus: false });
    const button = cta(slot);
    const logo = button.querySelector<HTMLImageElement>(
      '[data-slot="sign-in-logo"]',
    );

    expect(logo).not.toBeNull();
    expect(logo!.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("alt", "");
    expect(logo).toHaveAttribute("src", BORDERLESS_BADGE_SRC);
    expect(logo).toHaveAttribute("width", "22");
    expect(logo).toHaveAttribute("height", "22");
    expect(logo).toHaveClass("ph-a-logo");
    // First in the button, then the words; the name is the words alone.
    expect(button.firstElementChild).toBe(logo);
    expect(button).toHaveTextContent(words.cta);
    expect(button).toHaveAccessibleName(words.cta);
    expect(button.querySelector("svg.ph-spin")).toBeNull();
    // An empty alt takes it out of the accessibility tree.
    expect(within(button).queryByRole("img")).toBeNull();
  });

  it("ready: the account link opens Borderless's sign-up in a new tab", () => {
    renderScreen({ autoFocus: false });
    const link = within(tree(slot)).getByRole("link", { name: words.signUp });

    expect(link).toHaveAttribute("href", SIGN_UP);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleDescription("Opens in a new tab.");
    expect(link).toHaveAttribute("data-slot", "create-borderless-account");
    // The new-tab line is sr-only, in this tree.
    const note = document.getElementById(
      link.getAttribute("aria-describedby")!,
    );
    expect(note).toHaveClass("sr-only");
    expect(tree(slot)).toContainElement(note);
  });

  it("ready: a click starts the sign-in once", async () => {
    const user = userEvent.setup();
    const { onSignIn } = renderScreen({ autoFocus: false });

    await user.click(cta(slot));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("pending: spinner and the board's words, busy, and never fires again", async () => {
    const user = userEvent.setup();
    const { onSignIn } = renderScreen({ pending: true, autoFocus: false });
    const button = cta(slot);

    expect(button).toHaveTextContent("Opening Borderless…");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    // The spinner takes the logo's place: one leading glyph at a time.
    const spinner = button.querySelector("svg.ph-spin");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(button.firstElementChild).toBe(spinner);
    expect(button.querySelector('[data-slot="sign-in-logo"]')).toBeNull();
    expect(document.querySelector('[data-slot="sign-in"]')).toHaveAttribute(
      "data-pending",
      "true",
    );

    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onSignIn).not.toHaveBeenCalled();
    // Focus stays on the pending button (it is aria-disabled, not disabled).
    button.focus();
    expect(button).toHaveFocus();
  });

  it.each(["AUTH-1005", "AUTH-1046", "AUTH-1049", "GEN-1005"])(
    "error %s: the code's own words in this tree's alert",
    (code) => {
      renderScreen({ errorCode: code, autoFocus: false });
      const box = errorBox(slot);

      expect(box).toHaveAttribute("role", "alert");
      expect(box).toHaveAttribute("data-code", code);
      expect(box).toHaveTextContent(ERRORS[code]);
      expect(box.querySelector(".ph-signin-alert")).toHaveAttribute(
        "tabindex",
        "-1",
      );
      expect(box.querySelector('[data-slot="sign-in-cli-hint"]')).toBeNull();
      // The CTA is still there to try again, after the alert.
      expect(cta(slot)).toHaveTextContent(words.cta);
      expect(
        box.compareDocumentPosition(cta(slot)) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it.each([
    ["an unknown code", "NOPE-0000"],
    ["a code with ICU arguments", "GEN-1004"],
    ["markup", "<img src=x onerror=alert(1)>"],
  ])("error, %s: the generic line, never a catalog sentence", (_, code) => {
    renderScreen({ errorCode: code, autoFocus: false });
    const box = errorBox(slot);

    expect(box).toHaveAttribute("data-code", "unknown");
    expect(box).toHaveTextContent(ERRORS.unknown);
    expect(box).not.toHaveTextContent("Too many requests");
    expect(box.querySelector("img")).toBeNull();
  });

  it("cli: the terminal hint under the lead, the command in <code>", () => {
    renderScreen({ cli: true, autoFocus: false });
    const hints = tree(slot).querySelectorAll('[data-slot="sign-in-cli-hint"]');

    expect(hints).toHaveLength(1);
    const hint = hints[0] as HTMLElement;
    expect(hint).toHaveClass("ph-signin-hint");
    expect(hint).toHaveTextContent(
      "Return to your terminal and run applika login again.",
    );
    expect(within(hint).getByText("applika login").tagName).toBe("CODE");
    expect(errorBox(slot)).toBeEmptyDOMElement();
    expect(
      within(tree(slot)).getByRole("heading", { level: 1 }),
    ).toHaveTextContent(words.h1);
    // Under the lead, before the CTA.
    expect(
      hint.compareDocumentPosition(cta(slot)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="sign-in"]')).toHaveAttribute(
      "data-mode",
      "cli",
    );
  });

  it("cli error: the code's words and the cli line, inside the alert", () => {
    renderScreen({ cli: true, errorCode: "AUTH-1019", autoFocus: false });
    const box = errorBox(slot);

    expect(box).toHaveTextContent(ERRORS["AUTH-1019"]);
    const hint = box.querySelector<HTMLElement>(
      '[data-slot="sign-in-cli-hint"]',
    );
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent(
      "Return to your terminal and run applika login again.",
    );
    expect(within(hint!).getByText("applika login").tagName).toBe("CODE");
    // One cli line per tree: no separate grey hint beside the alert.
    expect(
      tree(slot).querySelectorAll('[data-slot="sign-in-cli-hint"]'),
    ).toHaveLength(1);
  });
});

describe("SignInScreen, phone tree: option C", () => {
  it("draws C's eyebrow and the Applika icon with the Borderless badge", () => {
    renderScreen({ autoFocus: false });
    const view = within(tree("sign-in-phone"));

    expect(view.getByText("applika × Borderless")).toBeInTheDocument();
    expect(view.getByRole("img", { name: "Applika" })).toBeInTheDocument();
    const badge = view.getByRole("img", { name: "with Borderless" });
    expect(badge.tagName).toBe("IMG");
    expect(badge).toHaveAttribute("src", BORDERLESS_BADGE_SRC);
    expect(BORDERLESS_BADGE_SRC).toBe("/borderless-logo.png");
    expect(badge.closest('[data-slot="sign-in-badge"]')).not.toBeNull();
  });

  it("keeps C's 56px button at 16px", () => {
    renderScreen({ autoFocus: false });
    expect(cta("sign-in-phone")).toHaveClass(
      "ph-btn",
      "ph-pri",
      "h-14",
      "text-[16px]",
    );
    expect(cta("sign-in-phone")).not.toHaveClass("ph-a-cta");
  });
});

describe("SignInScreen, desktop tree: option A", () => {
  const desktop = () => tree("sign-in-desktop");

  it("fills the page with A's mesh and dots, decorative", () => {
    renderScreen({ autoFocus: false });
    const mesh = desktop().querySelector(".ph-a-mesh");
    const dots = desktop().querySelector(".ph-dots");

    expect(mesh).toHaveAttribute("aria-hidden", "true");
    expect(dots).toHaveAttribute("aria-hidden", "true");
    expect(desktop()).toHaveClass("hidden", "md:flex");
    expect(desktop().querySelector("main")).toHaveClass("ph-a-main");
  });

  it("holds one card: tiles, h1, lead, CTA, a rule, the sign-up line, in that order", () => {
    renderScreen({ autoFocus: false });
    const card = desktop().querySelector<HTMLElement>(".ph-a-card")!;

    expect(card.parentElement).toBe(desktop().querySelector("main"));
    const order = [
      card.querySelector('[data-slot="sign-in-tiles"]'),
      within(card).getByRole("heading", { level: 1 }),
      card.querySelector(".ph-a-lead"),
      cta("sign-in-desktop"),
      card.querySelector('[data-slot="separator"]'),
      card.querySelector(".ph-a-foot"),
    ];
    for (const node of order)
      expect(card).toContainElement(node as HTMLElement);
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(card).getByRole("heading", { level: 1 })).toHaveClass(
      "ph-a-h1",
    );
    expect(cta("sign-in-desktop")).toHaveClass("ph-btn", "ph-pri", "ph-a-cta");
    expect(cta("sign-in-desktop")).not.toHaveClass("h-14", "text-[16px]");
  });

  it("pairs the tiles: Applika, the dashed link mark (hidden), Borderless", () => {
    renderScreen({ autoFocus: false });
    const tiles = desktop().querySelector<HTMLElement>(
      '[data-slot="sign-in-tiles"]',
    )!;

    expect(tiles).toHaveClass("ph-a-tiles");
    const [applika, link, borderless] = Array.from(tiles.children);
    expect(applika).toHaveClass("ph-a-tile", "text-primary");
    expect(
      within(applika as HTMLElement).getByRole("img"),
    ).toHaveAccessibleName("Applika");
    expect(link).toHaveClass("ph-a-link");
    expect(link).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelectorAll(".ph-a-dash")).toHaveLength(2);
    expect(link.querySelector(".ph-a-link-ic svg")).toHaveClass(
      "lucide-link-2",
    );
    expect(borderless).toHaveClass("ph-a-tile");
    const img = within(borderless as HTMLElement).getByRole("img", {
      name: "Borderless",
    });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", BORDERLESS_BADGE_SRC);
    // Every image the tree shows: the two tiles (the CTA's logo is decorative).
    expect(
      within(desktop())
        .getAllByRole("img")
        .map(
          (node) => node.getAttribute("aria-label") ?? node.getAttribute("alt"),
        ),
    ).toEqual(["Applika", "Borderless"]);
    // C's badge stays on the phone.
    expect(desktop().querySelector('[data-slot="sign-in-badge"]')).toBeNull();
  });

  it("draws the rule as a decorative separator and the sign-up line in A's words", () => {
    renderScreen({ autoFocus: false });
    const rule = desktop().querySelector('[data-slot="separator"]');

    expect(rule).toHaveClass("my-6");
    expect(rule).toHaveAttribute("data-orientation", "horizontal");
    expect(rule).toHaveAttribute("role", "none");
    const foot = desktop().querySelector<HTMLElement>(".ph-a-foot")!;
    expect(foot.tagName).toBe("P");
    expect(foot).toHaveTextContent(
      "No Borderless account yet? Create a Borderless account",
    );
    const link = within(foot).getByRole("link", {
      name: "Create a Borderless account",
    });
    expect(link).toHaveClass("ph-a-signup");
  });

  it("has no side panel, no h2 and no C eyebrow", () => {
    renderScreen({ autoFocus: false });
    const view = within(desktop());

    expect(view.queryByRole("region")).toBeNull();
    expect(view.queryByRole("heading", { level: 2 })).toBeNull();
    expect(view.queryByText("applika × Borderless")).toBeNull();
    expect(view.getAllByRole("button")).toEqual([cta("sign-in-desktop")]);
    expect(view.getAllByRole("link")).toHaveLength(1);
  });

  it("keeps the h1 with ?cli=1", () => {
    renderScreen({ cli: true, errorCode: "AUTH-1047", autoFocus: false });
    expect(
      within(desktop()).getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Sign in to applika");
  });
});

describe("SignInScreen: both widths", () => {
  it("lists only codes free of ICU arguments", () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      expect(ERRORS[code], code).toBeTruthy();
      expect(ERRORS[code], code).not.toMatch(/\{\w+/);
    }
  });

  it("mounts exactly one theme + language pair, theme first, outside both trees", () => {
    renderScreen({ autoFocus: false });

    const groups = screen.getAllByRole("radiogroup", {
      name: "Toggle language",
    });
    expect(groups).toHaveLength(1);
    const themes = screen.getAllByRole("button", { name: /toggle theme/i });
    expect(themes).toHaveLength(1);
    expect(themes[0].nextElementSibling).toBe(groups[0]);
    expect(groups[0].nextElementSibling).toBeNull();
    const bar = document.querySelector('[data-slot="sign-in-bar"]');
    expect(bar).toContainElement(groups[0]);
    expect(tree("sign-in-phone")).not.toContainElement(groups[0]);
    expect(tree("sign-in-desktop")).not.toContainElement(groups[0]);
  });

  it("offers the phone top bar's back link to the home page", () => {
    renderScreen({ autoFocus: false });
    const bar = document.querySelector<HTMLElement>(
      '[data-slot="sign-in-bar"]',
    )!;
    const back = within(bar).getByRole("link", { name: "Back to home" });

    expect(back).toHaveAttribute("href", "/");
    expect(back).toHaveClass("md:hidden");
  });

  it("gives each tree its own lead id", () => {
    renderScreen({ autoFocus: false });
    const phoneLead = cta("sign-in-phone").getAttribute("aria-describedby");
    const desktopLead = cta("sign-in-desktop").getAttribute("aria-describedby");

    expect(phoneLead).toBeTruthy();
    expect(desktopLead).toBeTruthy();
    expect(phoneLead).not.toBe(desktopLead);
  });

  it("announces pending once, with today's words, for both trees", () => {
    renderScreen({ pending: true, autoFocus: false });
    const status = screen.getAllByRole("status");

    expect(status).toHaveLength(1);
    expect(status[0]).toHaveAttribute("data-slot", "sign-in-pending-status");
    expect(status[0]).toHaveTextContent("Opening Borderless…");
    expect(status[0]).toHaveClass("sr-only");
  });

  it("announces nothing while ready", () => {
    renderScreen({ autoFocus: false });
    expect(
      document.querySelector('[data-slot="sign-in-pending-status"]'),
    ).toBeEmptyDOMElement();
  });
});

describe("SignInScreen: focus on load lands in the visible tree", () => {
  it("desktop width, no error: the desktop CTA", () => {
    renderScreen();
    expect(cta("sign-in-desktop")).toHaveFocus();
  });

  it("desktop width, an error: the desktop alert", () => {
    renderScreen({ errorCode: "AUTH-1046" });
    expect(document.activeElement).toBe(
      errorBox("sign-in-desktop").querySelector(".ph-signin-alert"),
    );
  });

  it("phone width, no error: the phone CTA", () => {
    mockPhoneViewport();
    renderScreen();
    expect(cta("sign-in-phone")).toHaveFocus();
  });

  it("phone width, an error: the phone alert, never the hidden tree's", () => {
    mockPhoneViewport();
    renderScreen({ errorCode: "AUTH-1049", cli: true });
    const alert = errorBox("sign-in-phone").querySelector(".ph-signin-alert");

    expect(document.activeElement).toBe(alert);
    expect(tree("sign-in-desktop")).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it("autoFocus off: nothing takes focus", () => {
    renderScreen({ autoFocus: false });
    expect(document.activeElement).toBe(document.body);
  });
});

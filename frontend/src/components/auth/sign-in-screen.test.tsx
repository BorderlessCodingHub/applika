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
 * Sign-in option C (signin/C_Mobile below md, signin/C_Desktop at md and up)
 * with v2/SignIn's states inside it. Both trees are in the DOM and CSS shows
 * one (jsdom applies no stylesheet), so every query is scoped to a tree by its
 * `data-slot`; the language + theme pair sits outside both, mounted once.
 */

const SIGN_UP = "https://borderless.example/sign-up";
const LEAD =
  "Sign in with Borderless. It confirms it's you and sends you back here.";
const ERRORS = en.errors as Record<string, string>;

const TREES = [
  ["phone", "sign-in-phone", "One account for your whole job search"],
  ["desktop", "sign-in-desktop", "Sign in to applika"],
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

describe.each(TREES)("SignInScreen, %s tree", (_name, slot, h1) => {
  it("ready: the board's heading, lead, CTA and account link", () => {
    renderScreen({ autoFocus: false });
    const view = within(tree(slot));

    expect(view.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    expect(view.getByText("applika × Borderless")).toBeInTheDocument();
    const button = view.getByRole("button", {
      name: "Continue with Borderless",
    });
    expect(button).toBe(cta(slot));
    // Described by this tree's own lead, never the other tree's.
    const leadId = button.getAttribute("aria-describedby")!;
    const lead = document.getElementById(leadId);
    expect(tree(slot)).toContainElement(lead);
    expect(lead).toHaveTextContent(LEAD);
    expect(button).toHaveAccessibleDescription(LEAD);
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(errorBox(slot)).toBeEmptyDOMElement();
    expect(
      tree(slot).querySelector('[data-slot="sign-in-cli-hint"]'),
    ).toBeNull();
  });

  it("ready: the Applika icon with the Borderless badge", () => {
    renderScreen({ autoFocus: false });
    const view = within(tree(slot));

    expect(view.getByRole("img", { name: "Applika" })).toBeInTheDocument();
    const badge = view.getByRole("img", { name: "with Borderless" });
    expect(badge.tagName).toBe("IMG");
    expect(badge).toHaveAttribute("src", BORDERLESS_BADGE_SRC);
    expect(BORDERLESS_BADGE_SRC).toBe("/borderless-logo.png");
    expect(badge.closest('[data-slot="sign-in-badge"]')).not.toBeNull();
  });

  it("ready: the account link opens Borderless's sign-up in a new tab", () => {
    renderScreen({ autoFocus: false });
    const link = within(tree(slot)).getByRole("link", {
      name: "I don't have a Borderless account",
    });

    expect(link).toHaveAttribute("href", SIGN_UP);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleDescription("Opens in a new tab.");
    expect(link).toHaveAttribute("data-slot", "create-borderless-account");
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
    expect(button.querySelector("svg.ph-spin")).not.toBeNull();
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
      // The CTA is still there to try again.
      expect(cta(slot)).toHaveTextContent("Continue with Borderless");
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
    ).toHaveTextContent(h1);
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

describe("SignInScreen: both widths", () => {
  it("lists only codes free of ICU arguments", () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      expect(ERRORS[code], code).toBeTruthy();
      expect(ERRORS[code], code).not.toMatch(/\{\w+/);
    }
  });

  it("mounts exactly one language + theme pair, outside both trees", () => {
    renderScreen({ autoFocus: false });

    const groups = screen.getAllByRole("radiogroup", {
      name: "Toggle language",
    });
    expect(groups).toHaveLength(1);
    const themes = screen.getAllByRole("button", { name: /toggle theme/i });
    expect(themes).toHaveLength(1);
    expect(groups[0].nextElementSibling).toBe(themes[0]);
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

  it("names the desktop side panel and keeps its headline an h2", () => {
    renderScreen({ autoFocus: false });
    const side = within(tree("sign-in-desktop")).getByRole("region", {
      name: "About applika",
    });

    expect(
      within(side).getByRole("heading", {
        level: 2,
        name: "One account for your whole job search",
      }),
    ).toBeInTheDocument();
    for (const feature of [
      "Every application in one place",
      "Interviews on your agenda",
      "Biweekly reports for your Borderless community",
    ]) {
      expect(within(side).getByText(feature)).toBeInTheDocument();
    }
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

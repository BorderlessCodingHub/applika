import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COPIED_MS,
  INSTALL,
  SIGN_IN,
  SKILL,
  TRACK,
} from "@/app/(public)/cli/cli-page";
import { APP_CONFIG } from "@/config";
import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneCli } from "./phone-cli";

/**
 * v3/Cli below md: the board's header (home, the language + theme pair, Sign
 * in), the hero, the four command blocks with Copy → "Copied", "Everything
 * else", the line back home and the footer. The commands are today's
 * (`cli-page.tsx`'s constants), so a copy gives the desktop block's text.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

const COMMANDS = {
  install: INSTALL,
  signIn: SIGN_IN,
  track: TRACK,
  skill: SKILL,
};

const BLOCKS = [
  ["install", "Install", INSTALL],
  ["sign-in", "Sign in", SIGN_IN],
  ["track", "Track from your terminal", TRACK],
  ["skill", "Teach your AI assistant", SKILL],
] as const;

const writeText = vi.fn();

/** `userEvent.setup()` installs its own clipboard; ours goes on after it. */
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<PhoneCli commands={COMMANDS} copiedMs={COPIED_MS} />, {
    wrapper: LocaleProvider,
  });
  return user;
}

const root = () =>
  document.querySelector<HTMLElement>('[data-slot="cli-phone"]')!;
const section = (block: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="cli-phone-section"][data-block="${block}"]`,
  )!;
const term = (block: string) =>
  section(block).querySelector<HTMLElement>('[data-slot="cli-phone-term"]')!;
const commandsOf = (block: string) =>
  term(block).querySelector<HTMLElement>('[data-slot="cli-phone-commands"]')!;
const copyOf = (block: string) =>
  within(term(block)).getByRole("button", { name: /^(Copy command|Copied)$/ });
const statusOf = (block: string) =>
  section(block).querySelector<HTMLElement>(
    '[data-slot="cli-phone-copy-status"]',
  )!;

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

afterEach(() => {
  writeText.mockReset();
  window.getSelection()?.removeAllRanges();
});

describe("PhoneCli", () => {
  it("is phone-only, on the board's root", () => {
    setup();
    expect(root()).toHaveClass("ph-app", "md:hidden", "flex", "flex-col");
  });

  it("draws the header: home, one language + theme pair, Sign in", () => {
    setup();
    const header = within(root()).getByRole("banner");

    expect(
      within(header).getByRole("link", { name: "Applika.dev home" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    expect(
      within(header).getByRole("radiogroup", { name: "Toggle language" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: /toggle theme/i }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("signed in, the header offers Dashboard instead of Sign in", () => {
    auth = { isAuthenticated: true, isLoading: false };
    setup();
    const header = within(root()).getByRole("banner");

    expect(
      within(header).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(within(header).queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("draws the hero: tile, Command line, applika-cli, the lead, View on PyPI", () => {
    setup();
    const main = within(root()).getByRole("main");
    const hero = main.querySelector<HTMLElement>(".ph-landing-hero")!;

    const tile = hero.querySelector(".ph-clp-tile")!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile.querySelector("svg")).toHaveClass("lucide-square-terminal");
    expect(within(hero).getByText("Command line")).toHaveClass(
      "ph-landing-eyebrow",
      "ph-clp-eyebrow",
    );
    expect(
      within(hero).getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toHaveClass("ph-mono", "ph-clp-h1");
    expect(
      within(hero).getByText(/Log, filter and update your job applications/),
    ).toHaveClass("ph-landing-lead");
    const pypi = within(hero).getByRole("link", {
      name: "View on PyPI Opens in a new tab.",
    });
    expect(pypi).toHaveClass("ph-clp-pypi");
    expect(pypi).toHaveAttribute("href", APP_CONFIG.cli.url);
    expect(pypi).toHaveAttribute("target", "_blank");
    expect(pypi).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("draws the four blocks in order, each labelled by its h2, with today's words", () => {
    setup();
    const main = within(root()).getByRole("main");

    expect(
      within(main)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      "Install",
      "Sign in",
      "Track from your terminal",
      "Teach your AI assistant",
      "Everything else",
    ]);
    for (const [block, title] of BLOCKS) {
      expect(within(main).getByRole("region", { name: title })).toBe(
        section(block),
      );
      expect(section(block)).toHaveClass("ph-clp-sec");
    }
    expect(section("install")).toHaveTextContent(
      "Needs Python 3.10 or newer. Install it with uv (recommended) or pipx; either gives you the global applika command.",
    );
    const codes = section("install").querySelectorAll("p code");
    expect([...codes].map((c) => c.textContent)).toEqual([
      "uv",
      "pipx",
      "applika",
    ]);
    for (const code of codes)
      expect(code).toHaveClass("ph-mono", "ph-clp-code");
  });

  it("lists the three sign-in modes as the board's bullet list", () => {
    setup();
    const modes = section("sign-in").querySelector<HTMLElement>(
      '[data-slot="cli-phone-modes"]',
    )!;

    expect(modes).toHaveClass("ph-clp-list");
    const items = within(modes).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Default: your browser opens and the sign-in comes back to the terminal by itself.",
      "Browser on another machine: --manual shows a code in the browser for you to paste in the terminal.",
      "No browser at all (SSH, containers): --device prints a short code to approve from any signed-in browser.",
    ]);
    for (const item of items) {
      expect(item).toHaveClass("ph-clp-li");
      expect(item.querySelector(".ph-clp-b")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(item.querySelector("strong")).not.toBeNull();
    }
  });

  it.each(BLOCKS)(
    "the %s terminal holds today's commands, each after an unselectable, hidden prompt",
    (block, _title, commands) => {
      setup();
      const pre = commandsOf(block);

      expect(term(block)).toHaveClass("ph-clp-term");
      expect(term(block)).toHaveAttribute("data-block", block);
      expect(pre.tagName).toBe("PRE");
      expect(pre).toHaveClass("ph-mono", "ph-hs");
      // The same lines as the desktop block, behind "$ ".
      expect(pre.textContent).toBe(
        commands.map((command) => `$ ${command}`).join("\n"),
      );
      const prompts = pre.querySelectorAll(".ph-clp-p");
      expect(prompts).toHaveLength(commands.length);
      for (const prompt of prompts) {
        expect(prompt).toHaveAttribute("aria-hidden", "true");
        expect(prompt.textContent).toBe("$ ");
      }
      // Not a tab stop: Copy gives the keyboard the whole text.
      expect(pre).not.toHaveAttribute("tabindex");
    },
  );

  it.each(BLOCKS)(
    "Copy on %s writes the desktop block's text and says Copied",
    async (block, title, commands) => {
      writeText.mockResolvedValue(undefined);
      const user = setup();

      const copy = copyOf(block);
      expect(copy).toHaveAccessibleName("Copy command");
      expect(copy).toHaveAccessibleDescription(title);
      expect(copy).toHaveAttribute("type", "button");
      expect(copy).toHaveClass("ph-clp-copy");
      expect(copy).toHaveAttribute("data-done", "false");
      expect(statusOf(block)).toHaveAttribute("role", "status");
      expect(statusOf(block)).toBeEmptyDOMElement();

      await user.click(copy);

      // Exactly what the desktop `CommandBlock` copies: no "$ ".
      expect(writeText).toHaveBeenCalledWith(commands.join("\n"));
      expect(copy).toHaveAccessibleName("Copied");
      expect(copy).toHaveAttribute("data-done", "true");
      expect(statusOf(block)).toHaveTextContent("Copied");
      // Only the block copied says it.
      for (const [other] of BLOCKS) {
        if (other !== block) {
          expect(copyOf(other)).toHaveAccessibleName("Copy command");
        }
      }
    },
  );

  it("says Copied for COPIED_MS, then Copy command again", async () => {
    writeText.mockResolvedValue(undefined);
    const user = setup();
    const copy = copyOf("skill");

    await user.click(copy);
    expect(copy).toHaveAccessibleName("Copied");

    // Real time, as the /cli/code precedent: the reset is `window.setTimeout`.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, COPIED_MS - 300));
    });
    expect(copy).toHaveAccessibleName("Copied");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(copy).toHaveAccessibleName("Copy command");
    expect(copy).toHaveAttribute("data-done", "false");
    expect(statusOf("skill")).toBeEmptyDOMElement();
  });

  it("copies Track's continued `new` command as today's text, two-space continuation", async () => {
    writeText.mockResolvedValue(undefined);
    const user = setup();

    await user.click(copyOf("track"));

    const text = writeText.mock.calls[0][0] as string;
    expect(text).toBe(TRACK.join("\n"));
    expect(text).toContain(
      '--role "Backend Engineer" \\\n  --platform LinkedIn',
    );
  });

  it("a refused clipboard: no Copied, nothing selected, the commands stay selectable", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const user = setup();

    await user.click(copyOf("install"));

    expect(writeText).toHaveBeenCalledWith(INSTALL.join("\n"));
    expect(copyOf("install")).toHaveAccessibleName("Copy command");
    expect(copyOf("install")).toHaveAttribute("data-done", "false");
    expect(statusOf("install")).toBeEmptyDOMElement();
    expect(screen.queryByText("Copied")).toBeNull();
    expect(window.getSelection()?.toString()).toBe("");

    // Select by hand: the commands are plain text in the `pre`.
    const pre = commandsOf("install");
    expect(pre).not.toHaveAttribute("aria-hidden");
    expect(pre.style.userSelect).toBe("");
    const range = document.createRange();
    range.selectNodeContents(pre);
    window.getSelection()?.addRange(range);
    for (const command of INSTALL) {
      expect(window.getSelection()?.toString()).toContain(command);
    }
  });

  it("draws Everything else as its card, with View on PyPI in a new tab", () => {
    setup();
    const more = within(root()).getByRole("region", {
      name: "Everything else",
    });

    expect(more).toHaveAttribute("data-slot", "cli-phone-more");
    expect(more).toHaveClass("ph-clp-more");
    expect(
      within(more).getByText(
        "Application timelines, finalizing and every flag are documented on the package page.",
      ),
    ).toHaveClass("ph-clp-more-p");
    const link = within(more).getByRole("link", {
      name: "View on PyPI Opens in a new tab.",
    });
    expect(link).toHaveClass("ph-clp-more-a");
    expect(link).toHaveAttribute("href", APP_CONFIG.cli.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("svg")).toHaveClass("lucide-arrow-up-right");
  });

  it("links back to the home page, then the footer: Cookie policy and ©", () => {
    setup();
    const back = within(root()).getByRole("link", { name: "home page" });
    expect(back).toHaveAttribute("href", "/");
    expect(back).toHaveClass("ph-clp-back-a");
    expect(back.parentElement).toHaveClass("ph-clp-back");
    expect(back.parentElement).toHaveTextContent("Back to the home page.");

    const footer = within(root()).getByRole("contentinfo");
    expect(footer).toHaveClass("ph-landing-footer", "ph-clp-footer");
    const cookie = within(footer).getByRole("link", { name: "Cookie policy" });
    expect(cookie).toHaveAttribute("href", "/cookie-policy");
    expect(cookie).toHaveClass("min-h-11");
    expect(footer).toHaveTextContent("© Applika.dev");
    // The footer follows the main, as the board draws it.
    expect(root().lastElementChild).toBe(footer);
  });

  it("every control the board draws carries its name, in board order", () => {
    setup();
    const view = within(root());
    const controls = [
      ...view.getAllByRole("link"),
      ...view.getAllByRole("button"),
      ...view.getAllByRole("radio"),
    ].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const names: (string | RegExp)[] = [
      "Applika.dev home",
      "English",
      "Português",
      /toggle theme/i,
      "Sign in",
      "View on PyPI Opens in a new tab.",
      "Copy command",
      "Copy command",
      "Copy command",
      "Copy command",
      "View on PyPI Opens in a new tab.",
      "home page",
      "Cookie policy",
    ];
    expect(controls).toHaveLength(names.length);
    controls.forEach((control, index) =>
      expect(control).toHaveAccessibleName(names[index]),
    );
  });
});

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/locale-provider";

import { CliCodePage } from "./cli-code-page";

/**
 * `/cli/code?code=&state=` (R-019) shows `<code>#<state>` read-only with
 * Copy, for the user to paste into the CLI.
 */

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

const writeText = vi.fn();

beforeEach(() => {
  searchParams = new URLSearchParams();
});

afterEach(() => {
  writeText.mockReset();
  vi.useRealTimers();
});

/** `userEvent.setup()` installs its own clipboard; ours goes on after it. */
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<CliCodePage />, { wrapper: LocaleProvider });
  return user;
}

/**
 * Both widths' trees are in the DOM (CSS shows one, jsdom applies none):
 * today's card at md and up, v2/CliCode below md. Each case runs on each.
 */
const TREES = [
  ["desktop", "cli-code-desktop"],
  ["phone (v2/CliCode)", "cli-code-phone"],
] as const;

describe.each(TREES)("CliCodePage, %s tree", (_name, slot) => {
  const tree = () =>
    document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
  const view = () => within(tree());
  const value = () => tree().querySelector('[data-slot="cli-code-value"]');
  const status = () => tree().querySelector('[data-slot="cli-code-status"]');

  it("shows code#state read-only under its h1 and instruction", () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    setup();

    expect(
      view().getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeInTheDocument();
    expect(
      view().getByText("Paste this code into your terminal"),
    ).toBeInTheDocument();
    expect(value()).toHaveTextContent("abc123#xyz789");
    expect(value()?.tagName).toBe("CODE");
    expect(view().queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      view().getByText("The code works once and expires after a minute."),
    ).toBeInTheDocument();
    expect(
      view().getByRole("button", { name: "Copy" }),
    ).toHaveAccessibleDescription("Paste this code into your terminal");
  });

  it("Copy writes code#state to the clipboard and says Copied, then resets", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockResolvedValue(undefined);
    const user = setup();

    await user.click(view().getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("abc123#xyz789");
    expect(view().getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("Code copied.");
    expect(status()).toHaveAttribute("role", "status");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_100));
    });
    expect(view().getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(status()).toBeEmptyDOMElement();
  });

  it("a failed copy selects the code and says how to copy it", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockRejectedValue(new Error("denied"));
    const user = setup();

    await user.click(view().getByRole("button", { name: "Copy" }));

    expect(status()).toHaveTextContent(
      "Could not copy. The code is selected, copy it with your keyboard.",
    );
    expect(window.getSelection()?.toString()).toBe("abc123#xyz789");
  });

  it.each([
    ["no params", ""],
    ["no state", "code=abc123"],
    ["no code", "state=xyz789"],
    ["a blank state", "code=abc123&state="],
  ])("%s: says the link is missing its code, offers no Copy", (_, query) => {
    searchParams = new URLSearchParams(query);
    setup();

    const missing = tree().querySelector('[data-slot="cli-code-missing"]');
    expect(missing).toHaveTextContent("This sign-in link is missing its code.");
    expect(missing).toHaveTextContent(
      "Run the login command in your terminal again.",
    );
    expect(value()).not.toBeInTheDocument();
    expect(view().queryByRole("button", { name: "Copy" })).toBeNull();
    expect(
      view().getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeInTheDocument();
  });
});

describe("CliCodePage, both widths", () => {
  it("copying in one tree leaves the other as it was", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockResolvedValue(undefined);
    const user = setup();
    const phone = document.querySelector<HTMLElement>(
      '[data-slot="cli-code-phone"]',
    )!;
    const desktop = document.querySelector<HTMLElement>(
      '[data-slot="cli-code-desktop"]',
    )!;

    await user.click(within(phone).getByRole("button", { name: "Copy" }));

    expect(within(phone).getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(within(desktop).getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("the phone tree says copied to screen readers only, as the board does", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockResolvedValue(undefined);
    const user = setup();
    const phone = document.querySelector<HTMLElement>(
      '[data-slot="cli-code-phone"]',
    )!;

    await user.click(within(phone).getByRole("button", { name: "Copy" }));

    const status = phone.querySelector('[data-slot="cli-code-status"]');
    expect(status).toHaveTextContent("Code copied.");
    expect(status).toHaveClass("ph-sr");
    expect(phone).toHaveAttribute("data-state", "ready");
  });

  // The pair's order (theme, then language) is pinned with the real theme
  // toggle in `language-toggle-mounts.test.tsx`; here it is mocked away.
  it("mounts one theme + language pair for both trees", () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    setup();

    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
  });
});

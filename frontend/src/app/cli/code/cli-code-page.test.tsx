import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/locale-provider";

import { CliCodePage } from "./cli-code-page";

/**
 * KODI-058 (AC11 web half, R-019): `/cli/code?code=&state=` shows
 * `<code>#<state>` read-only with Copy, for the user to paste into the CLI.
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

const value = () => document.querySelector('[data-slot="cli-code-value"]');
const status = () => document.querySelector('[data-slot="cli-code-status"]');

describe("CliCodePage", () => {
  it("shows code#state read-only under its h1 and instruction", () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    setup();

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Paste this code into your terminal"),
    ).toBeInTheDocument();
    expect(value()).toHaveTextContent("abc123#xyz789");
    expect(value()?.tagName).toBe("CODE");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Copy writes code#state to the clipboard and says Copied, then resets", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockResolvedValue(undefined);
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("abc123#xyz789");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("Code copied.");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_100));
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(status()).toBeEmptyDOMElement();
  });

  it("a failed copy selects the code and says how to copy it", async () => {
    searchParams = new URLSearchParams("code=abc123&state=xyz789");
    writeText.mockRejectedValue(new Error("denied"));
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Copy" }));

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

    const missing = document.querySelector('[data-slot="cli-code-missing"]');
    expect(missing).toHaveTextContent("This sign-in link is missing its code.");
    expect(missing).toHaveTextContent(
      "Run the login command in your terminal again.",
    );
    expect(value()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeInTheDocument();
  });
});

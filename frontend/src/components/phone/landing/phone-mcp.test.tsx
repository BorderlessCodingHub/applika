import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { MCP_APP_NAMES, MCP_TAB_HREF, PhoneMcp } from "./phone-mcp";

/**
 * 0023/McpPage below md: the public phone header (PhoneLandingHeader, so
 * the theme and language toggles stay reachable, mobile-design rule 5), the
 * hero with Create a token, three steps, the server address with Copy, the
 * apps, what it can do, its reach, the controls and the footer.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

const ENDPOINT = "https://applika.dev/api/mcp";

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

function renderPhone() {
  return render(<PhoneMcp endpoint={ENDPOINT} />, { wrapper: LocaleProvider });
}

const root = () =>
  document.querySelector<HTMLElement>('[data-slot="mcp-phone"]')!;

/** After `userEvent.setup()`, which puts its own clipboard in place. */
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("PhoneMcp", () => {
  it("is phone-only, with the public phone header: home, theme, language and Sign in", () => {
    renderPhone();

    expect(root()).toHaveClass("ph-app", "md:hidden");
    const header = within(screen.getByRole("banner"));
    expect(
      header.getByRole("link", { name: "Applika.dev home" }),
    ).toHaveAttribute("href", "/");
    expect(
      header.getByRole("radiogroup", { name: "Toggle language" }),
    ).toBeInTheDocument();
    expect(
      header.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("offers Dashboard to a signed-in visitor", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderPhone();

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("draws the board's hero: tile, eyebrow, title, lead and Create a token", () => {
    renderPhone();

    expect(root().querySelector(".ph-mcp-tile svg")).not.toBeNull();
    expect(screen.getByText("MCP server")).toHaveClass(
      "ph-landing-eyebrow",
      "ph-mcp-eyebrow",
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Applika in your AI assistant",
      }),
    ).toHaveClass("ph-mcp-h1");
    const cta = screen.getByRole("link", { name: "Create a token" });
    expect(cta).toHaveAttribute("href", MCP_TAB_HREF);
    expect(MCP_TAB_HREF).toBe("/profile?tab=mcp");
    expect(cta).toHaveClass("ph-mcp-cta");
    expect(
      screen.getByText("You sign in first, then land on Profile › MCP."),
    ).toHaveClass("ph-mcp-cta-note");
  });

  it("orders its sections as the board does, steps numbered", () => {
    renderPhone();

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Connect in three steps",
      "Server address",
      "Works with",
      "What your assistant can do",
      "You choose its reach",
      "You stay in control",
    ]);
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Create a token", "Copy the configuration", "Paste it and ask"]);
    expect(
      [...root().querySelectorAll(".ph-mcp-n")].map((n) => n.textContent),
    ).toEqual(["1", "2", "3"]);
  });

  it("prints the address it is given and copies it", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderPhone();

    const address = root().querySelector<HTMLElement>(
      '[data-slot="mcp-phone-address"]',
    )!;
    expect(address).toHaveClass("ph-mcp-term");
    expect(address).toHaveTextContent(ENDPOINT);
    const copy = within(address).getByRole("button", {
      name: "Copy the server address",
    });
    expect(copy).toHaveClass("ph-mcp-copy");
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith(ENDPOINT);
    expect(copy).toHaveAttribute("data-done", "true");
    expect(
      within(address).getByRole("button", { name: "Server address copied" }),
    ).toBe(copy);
  });

  it("lists the apps in two columns, scope pills and the controls", () => {
    renderPhone();

    expect(MCP_APP_NAMES).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Cursor",
      "VS Code",
      "Codex CLI",
      "Gemini CLI",
    ]);
    expect(
      [...root().querySelectorAll(".ph-mcp-apps > .ph-mcp-app")].map(
        (app) => app.textContent,
      ),
    ).toEqual(MCP_APP_NAMES);
    expect(
      [...root().querySelectorAll('.ph-mcp-reach [data-slot="mcp-scope"]')].map(
        (chip) => [chip.textContent, chip.className],
      ),
    ).toEqual([
      ["Read only", "ph-pill"],
      ["Read and write", "ph-pill ph-pri"],
      ["Full access", "ph-pill ph-mt-full"],
    ]);
    expect(root().querySelectorAll(".ph-mcp-li")).toHaveLength(7);
  });

  it("ends with the footer: Home, Cookie policy and the name", () => {
    renderPhone();

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(footer.getByRole("link", { name: "Cookie policy" })).toHaveAttribute(
      "href",
      "/cookie-policy",
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent("© Applika.dev");
  });
});

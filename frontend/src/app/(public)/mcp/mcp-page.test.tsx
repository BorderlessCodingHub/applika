import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { APP_CONFIG } from "@/config";
import { LocaleProvider } from "@/i18n/locale-provider";

import { McpPage } from "./mcp-page";
import Page, { metadata } from "./page";

/**
 * PRD 0023 AC6: the public MCP page replaces the applika-cli page: what the
 * server does, which apps it works with, how to connect in three steps, and
 * a link to the MCP tab. Both widths' trees are mounted and CSS shows one
 * (McpPage below md, DeskMcpPage at md and up); jsdom applies no CSS, so
 * every query is scoped by the tree's `data-slot`.
 */

function renderPage() {
  return render(<McpPage />, { wrapper: LocaleProvider });
}

const tree = (slot: "mcp-phone" | "mcp-desktop") =>
  document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
const desktop = () => within(tree("mcp-desktop"));

/** After `userEvent.setup()`, which puts its own clipboard in place. */
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("/mcp", () => {
  it("is the indexed Applika MCP page, canonical /mcp", () => {
    expect(metadata.title).toBe("Applika MCP");
    expect(metadata.alternates?.canonical).toBe("/mcp");
    expect(metadata.robots).toMatchObject({ index: true });
    render(<Page />, { wrapper: LocaleProvider });
    expect(tree("mcp-desktop")).toBeInTheDocument();
  });

  it("mounts the phone tree first (below md) and the desktop tree in a box-less wrapper", () => {
    renderPage();

    expect(tree("mcp-phone")).toHaveClass("md:hidden");
    expect(tree("mcp-desktop")).toHaveClass("hidden", "md:contents");
    expect(
      tree("mcp-phone").compareDocumentPosition(tree("mcp-desktop")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // One <main> per tree; the desktop one sits under the layout's header.
    expect(desktop().getAllByRole("main")).toHaveLength(1);
    expect(desktop().queryByRole("banner")).toBeNull();
  });
});

describe("McpPage, desktop tree (md and up)", () => {
  it("says what the server does, with the CTA to Profile › MCP", () => {
    renderPage();

    expect(desktop().getByText("MCP server")).toBeInTheDocument();
    expect(
      desktop().getByRole("heading", {
        level: 1,
        name: "Applika in your AI assistant",
      }),
    ).toBeInTheDocument();
    const cta = desktop().getByRole("link", { name: "Create a token" });
    expect(cta).toHaveAttribute("href", "/profile?tab=mcp");
    expect(cta).toHaveAttribute("data-action", "mcp-create-token");
    expect(
      desktop().getByText("You sign in first, then land on Profile › MCP."),
    ).toBeInTheDocument();
    expect(
      desktop().getByRole("figure", { name: "Example conversation" }),
    ).toHaveTextContent("applika · add_timeline_event");
  });

  it("orders the sections as the board does", () => {
    renderPage();

    expect(
      desktop()
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
  });

  it("connects in three steps", () => {
    renderPage();

    const steps = desktop()
      .getByRole("heading", { level: 2, name: "Connect in three steps" })
      .closest("section")!;
    expect(
      within(steps)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Create a token", "Copy the configuration", "Paste it and ask"]);
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
  });

  it("lists the six apps it writes a configuration for, and the ones that wait", () => {
    renderPage();

    const apps = desktop()
      .getByRole("heading", { level: 2, name: "Works with" })
      .closest("section")!;
    expect(
      within(apps)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Cursor",
      "VS Code",
      "Codex CLI",
      "Gemini CLI",
    ]);
    expect(apps).toHaveTextContent(
      "Apps that only connect through their own sign-in page, like claude.ai or ChatGPT on the web, are not supported yet.",
    );
  });

  it("prints the server address from the config, with Copy", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderPage();

    const address = tree("mcp-desktop").querySelector<HTMLElement>(
      '[data-slot="mcp-desktop-address"]',
    )!;
    expect(address).toHaveTextContent(APP_CONFIG.mcp.endpoint);
    await user.click(
      within(address).getByRole("button", { name: "Copy the server address" }),
    );
    expect(writeText).toHaveBeenCalledWith(APP_CONFIG.mcp.endpoint);
    expect(
      within(address).getByRole("button", { name: "Server address copied" }),
    ).toHaveTextContent("Copied");
  });

  it("shows the three scopes and what each reaches", () => {
    renderPage();

    const reach = desktop()
      .getByRole("heading", { level: 2, name: "You choose its reach" })
      .closest("section")!;
    expect(
      [...reach.querySelectorAll('[data-slot="mcp-scope"]')].map((chip) =>
        chip.getAttribute("data-scope"),
      ),
    ).toEqual(["read", "read_write", "full"]);
    expect(reach).toHaveTextContent("Looks things up. Changes nothing.");
    expect(reach).toHaveTextContent(
      "Also creates, edits, closes and reopens. Deletes nothing.",
    );
    expect(reach).toHaveTextContent(
      "Also deletes timeline events and CVs. Your app asks you first.",
    );
  });

  it("keeps the user in control: Devices, 90 days, own data only", () => {
    renderPage();

    const control = desktop()
      .getByRole("heading", { level: 2, name: "You stay in control" })
      .closest("section")!;
    expect(
      within(control)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Every token is listed in Devices. Revoke it and it stops at once.",
      "A token ends 90 days after its last use.",
      "It reaches only your own data, never anyone else's, and never admin tools.",
    ]);
  });

  it("names no CLI anywhere", () => {
    renderPage();

    expect(document.body).not.toHaveTextContent(/applika-cli|PyPI|pipx/);
  });
});

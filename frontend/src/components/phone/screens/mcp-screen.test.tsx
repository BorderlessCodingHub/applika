import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/app/(protected)/profile/profile-page";
import { APP_CONFIG } from "@/config";
import type { McpTokenCreated, UserSession } from "@/services/types/sessions";
import { setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * PRD 0023 below md (ADR-0027): Profile › MCP is 0023/Main with its
 * connections, or 0023/McpEmpty whole without one; New token opens one sheet
 * that is McpCreate, then McpToken (the token once, the client chips and
 * their configurations); Revoke goes through a confirm sheet. Rendered through
 * the real page at `/profile?tab=mcp` in the phone shell (services mocked).
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  revoke: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/profile";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      list: mocks.list,
      revoke: mocks.revoke,
      revokeOthers: vi.fn(),
      createMcpToken: mocks.create,
    },
    statistics: { getGeneralStats: () => new Promise(() => {}) },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const TOKEN = "applika_mcp_fake_00000000000000000000000000000000000000";

function session(
  id: string,
  overrides: Partial<UserSession> = {},
): UserSession {
  return {
    id,
    client_type: "mcp",
    sign_in_method: "mcp_token",
    device_name: `Token ${id}`,
    client_label: "Unknown device",
    created_ip: "188.81.24.6",
    last_ip: "188.81.24.6",
    created_at: "2026-11-14T09:00:00Z",
    last_used_at: "2026-11-14T11:58:00Z",
    expires_at: "2027-02-12T11:58:00Z",
    ended_at: null,
    status: "active",
    current: false,
    scope: ["read", "write"],
    ...overrides,
  };
}

const WEB = session("w1", {
  client_type: "web",
  sign_in_method: "borderless",
  device_name: "Chrome on macOS",
  scope: null,
  current: true,
});
const CLAUDE = session("m1", { device_name: "Claude Code on my laptop" });
const CURSOR = session("m2", {
  device_name: "Cursor",
  scope: ["read"],
  last_ip: null,
  last_used_at: null,
});

const CREATED: McpTokenCreated = {
  id: "m9",
  name: "Gemini CLI",
  scope: ["read", "write", "delete"],
  token: TOKEN,
  created_at: "2026-11-14T12:00:00Z",
  expires_at: "2027-02-12T12:00:00Z",
};

// Saturday 14 November 2026, 12:00 UTC.
const NOW = new Date("2026-11-14T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setLocation("/profile?tab=mcp");
  mocks.list.mockReset().mockResolvedValue([WEB, CLAUDE, CURSOR]);
  mocks.revoke.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockResolvedValue(CREATED);
});

afterEach(() => {
  vi.useRealTimers();
});

const renderMcp = (locale: "en" | "pt-BR" = "en") =>
  renderPhoneScreen("/profile", <ProfilePage />, { locale });

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="mcp-row"][data-session-id="${id}"]`,
  )!;

/** After `userEvent.setup()`, which puts its own clipboard in place. */
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("Profile › MCP below md", () => {
  it("renders Main: the switch on MCP, the address, New token and each connection", async () => {
    await renderMcp();

    expect(
      await screen.findByRole("heading", { level: 1, name: "MCP connections" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Profile sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Profile", "MCP", "Devices"]);
    expect(within(nav).getByRole("link", { name: "MCP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByText(
        "Tokens that let your AI app use Applika through the MCP server. Each one is also listed in Devices.",
      ),
    ).toBeInTheDocument();
    const address = document.querySelector<HTMLElement>(
      '[data-slot="mcp-address"]',
    )!;
    expect(address).toHaveClass("ph-card", "ph-mt-addr");
    expect(address).toHaveTextContent(APP_CONFIG.mcp.endpoint);
    expect(
      within(address).getByRole("button", { name: "Copy the server address" }),
    ).toHaveClass("ph-mt-copy");
    expect(screen.getByRole("button", { name: "New token" })).toHaveClass(
      "ph-btn",
      "ph-pri",
    );

    await screen.findByText("Claude Code on my laptop");
    expect(
      screen.getByRole("heading", { level: 2, name: "Active" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Chrome on macOS")).toBeNull();

    const claude = card("m1");
    expect(claude).toHaveClass("ph-card", "ph-dv-card");
    expect(
      within(claude)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Created", "Last used", "IP address", "Ends"]);
    expect(within(claude).getByText("Nov 14, 2026")).toBeInTheDocument();
    expect(within(claude).getByText("2 minutes ago")).toBeInTheDocument();
    expect(within(claude).getByText("188.81.24.6")).toHaveClass("ph-mono");
    expect(
      within(claude).getByText("Feb 12, 2027 if unused"),
    ).toBeInTheDocument();
    expect(claude.querySelector('[data-slot="mcp-scope"]')).toHaveTextContent(
      "Read and write",
    );
    expect(claude.querySelector('[data-slot="mcp-scope"]')).toHaveClass(
      "ph-pill",
      "ph-pri",
    );
    expect(
      within(claude).getByRole("button", {
        name: "Revoke the token Claude Code on my laptop",
      }),
    ).toHaveClass("ph-btn", "ph-dan", "ph-sm");

    const cursor = card("m2");
    expect(within(cursor).getByText("Never")).toBeInTheDocument();
    expect(within(cursor).getByText("Not recorded")).toBeInTheDocument();
    expect(cursor.querySelector('[data-slot="mcp-scope"]')).toHaveTextContent(
      "Read only",
    );

    expect(screen.getByRole("link", { name: "How MCP works" })).toHaveAttribute(
      "href",
      "/mcp",
    );
    expect(
      screen.getByText(/A token ends 90 days after its last use\./),
    ).toBeInTheDocument();
  });

  it("renders McpEmpty whole without a connection", async () => {
    mocks.list.mockResolvedValue([WEB]);
    await renderMcp();

    const empty = await screen.findByRole("region", {
      name: "No MCP connections yet",
    });
    expect(empty).toHaveClass("ph-card", "ph-mt-empty");
    expect(
      within(empty)
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toEqual([
      "1Create a token and choose what it may do.",
      "2Copy the configuration for your app. It holds the token.",
      "3Paste it in your app and restart it.",
    ]);
    expect(
      within(empty).getByRole("button", { name: "Create token" }),
    ).toHaveClass("ph-btn", "ph-pri", "ph-mt-empty-cta");
    expect(
      within(empty).getByRole("link", { name: "What is MCP?" }),
    ).toHaveAttribute("href", "/mcp");
    expect(screen.getByText(APP_CONFIG.mcp.endpoint)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New token" })).toBeNull();
  });

  it("shows the list loading, then its failure with Retry", async () => {
    vi.useRealTimers();
    let fail: (error: unknown) => void = () => {};
    mocks.list.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderMcp();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading MCP connections");

    fail({ response: { status: 503, data: { detail: "Try later" } } });
    expect(await screen.findByText("Try later")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Claude Code on my laptop"),
    ).toBeInTheDocument();
  });

  it("creates a token in a sheet, then shows it once with each app's configuration", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const writeText = mockClipboard();
    await renderMcp();
    await screen.findByText("Claude Code on my laptop");

    await user.click(screen.getByRole("button", { name: "New token" }));
    const sheet = screen.getByRole("dialog", { name: "New MCP token" });
    expect(sheet).toHaveClass("ph-sheet", "ph-mt-sheet");
    expect(sheet).not.toHaveClass("ph-mt-sheet-tall");
    await waitFor(() =>
      expect(
        within(sheet).getByRole("heading", { name: "New MCP token" }),
      ).toHaveFocus(),
    );
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("MCP connection");
    expect(name).toHaveAccessibleDescription(
      "Shown in Devices and in this tab. 14/100",
    );
    const recommended = within(sheet).getByRole("radio", {
      name: "Read and write",
    });
    expect(recommended).toBeChecked();
    expect(recommended).toHaveClass("ph-opt", "ph-on");
    expect(within(sheet).getByText("Recommended")).toHaveClass("ph-mt-rec");

    await user.clear(name);
    await user.type(name, "Gemini CLI");
    await user.click(within(sheet).getByRole("radio", { name: "Full access" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Create token" }),
    );

    expect(mocks.create).toHaveBeenCalledWith({
      name: "Gemini CLI",
      scope: ["read", "write", "delete"],
    });
    const result = await screen.findByRole("dialog", {
      name: "Your token is ready",
    });
    expect(result).toHaveClass("ph-mt-sheet", "ph-mt-sheet-tall");
    expect(result).toHaveAccessibleDescription(
      "Gemini CLI · Full access · ends 90 days after its last use",
    );
    expect(within(result).getByRole("note")).toHaveClass("ph-mt-warn");
    expect(
      result.querySelector('[data-slot="mcp-token-value"]'),
    ).toHaveTextContent(TOKEN);
    await waitFor(() =>
      expect(
        within(result).getByRole("heading", { name: "Your token is ready" }),
      ).toHaveFocus(),
    );

    await user.click(
      within(result).getByRole("button", { name: "Copy the token" }),
    );
    expect(writeText).toHaveBeenCalledWith(TOKEN);

    const apps = within(result).getByRole("group", { name: "AI app" });
    const chips = within(apps).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Cursor",
      "VS Code",
      "Codex CLI",
      "Gemini CLI",
      "Other",
    ]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    for (const chip of chips) expect(chip).toHaveClass("ph-chip", "ph-mt-chip");
    const config = () =>
      result.querySelector<HTMLElement>('[data-slot="mcp-config"]')!;
    // McpToken's narrow line breaks.
    expect(config().textContent).toBe(
      `claude mcp add --transport http \\\n  --scope user applika \\\n  ${APP_CONFIG.mcp.endpoint} \\\n  --header "Authorization: Bearer ${TOKEN}"`,
    );

    await user.click(within(apps).getByRole("button", { name: "Gemini CLI" }));
    expect(
      within(apps).getByRole("button", { name: "Gemini CLI" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(chips[0]).toHaveAttribute("aria-pressed", "false");
    expect(config()).toHaveAttribute("data-client", "gemini");
    expect(
      result.querySelector('[data-slot="mcp-config-where"]'),
    ).toHaveTextContent("In ~/.gemini/settings.json, your user file.");
    await user.click(
      within(result).getByRole("button", { name: "Copy the configuration" }),
    );
    expect(writeText).toHaveBeenLastCalledWith(config().textContent);

    await user.click(within(result).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body).not.toHaveTextContent(TOKEN);
  });

  it("says a refusal inside the create sheet", async () => {
    vi.useRealTimers();
    const headers = new AxiosHeaders();
    mocks.create.mockRejectedValue(
      new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 503,
        statusText: "refused",
        headers,
        config: {} as never,
        data: { detail: "x", code: "AUTH-1003" },
      }),
    );
    const user = userEvent.setup();
    await renderMcp();
    await screen.findByText("Claude Code on my laptop");

    await user.click(screen.getByRole("button", { name: "New token" }));
    await user.click(screen.getByRole("button", { name: "Create token" }));

    const sheet = screen.getByRole("dialog", { name: "New MCP token" });
    const alert = await within(sheet).findByRole("alert");
    expect(alert).toHaveClass("ph-notice");
    expect(alert).toHaveAttribute("data-tone", "error");
    expect(alert).toHaveTextContent("Session service unavailable");
  });

  it("revokes a connection after its confirm sheet; Cancel first", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    await renderMcp();
    await screen.findByText("Cursor");

    const revoke = screen.getByRole("button", {
      name: "Revoke the token Cursor",
    });
    await user.click(revoke);
    let sheet = screen.getByRole("alertdialog", {
      name: "Revoke the token Cursor?",
    });
    expect(sheet).toHaveTextContent(
      "Apps that use it lose access on their next call. To connect again, create a new token.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(mocks.revoke).not.toHaveBeenCalled();

    mocks.list.mockResolvedValue([WEB, CLAUDE]);
    await user.click(revoke);
    sheet = screen.getByRole("alertdialog", {
      name: "Revoke the token Cursor?",
    });
    await user.click(
      within(sheet).getByRole("button", { name: "Revoke token" }),
    );

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("m2"));
    await waitFor(() => expect(card("m2")).toBeNull());
  });

  it("speaks Portuguese", async () => {
    await renderMcp("pt-BR");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Conexões MCP" }),
    ).toBeInTheDocument();
    await screen.findByText("Claude Code on my laptop");
    expect(
      within(card("m1"))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Criado", "Último uso", "Endereço IP", "Termina"]);
    expect(within(card("m1")).getByText("Leitura e escrita")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Novo token" }),
    ).toBeInTheDocument();
  });
});
